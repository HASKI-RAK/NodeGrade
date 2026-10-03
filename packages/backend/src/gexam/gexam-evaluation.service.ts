import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { PrismaService } from '../prisma.service.js';
import { GraphExecutionError } from '../core/Graph.js';
import { ProviderRuntimeService } from '../provider/provider-runtime.service.js';
import { executeGexamGraph } from './gexam-evaluation.graph.js';
import {
  evaluationRequestSchema,
  evaluationResultSchema,
  modelEvaluationSchema,
  type EvaluationRequest,
  type EvaluationResult,
} from './gexam-evaluation.schema.js';

const MAX_CONCURRENT_EVALUATIONS = 2;

type EvaluationRecord = Awaited<
  ReturnType<PrismaService['gexamEvaluation']['findUnique']>
>;

const parseModelJson = (text: string): unknown => {
  const trimmed = text.trim();
  const raw = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  return JSON.parse(raw) as unknown;
};

const safeFailure = (error: unknown): { code: string; message: string } => {
  if (error instanceof ServiceUnavailableException) {
    const response: unknown = error.getResponse();
    if (
      typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      'message' in response &&
      typeof response.code === 'string' &&
      typeof response.message === 'string'
    )
      return { code: response.code, message: response.message };
  }
  if (
    error instanceof SyntaxError ||
    error instanceof ZodError ||
    (error instanceof Error &&
      /assessment|rubric criterion/i.test(error.message))
  )
    return {
      code: 'GEXAM_MODEL_RESPONSE_INVALID',
      message:
        'The model response did not satisfy the criterion assessment contract.',
    };
  if (
    error instanceof GraphExecutionError &&
    error.traceError.code === 'timeout'
  )
    return {
      code: 'GEXAM_MODEL_TIMEOUT',
      message: 'The model evaluation timed out.',
    };
  if (error instanceof HttpException)
    return {
      code: 'GEXAM_PROVIDER_ERROR',
      message: 'The model provider could not run this evaluation.',
    };
  return { code: 'GEXAM_EVALUATION_FAILED', message: 'The evaluation failed.' };
};

/** Converts model prose into a bounded, auditable result in rubric order. */
export function validateEvaluation(
  request: EvaluationRequest,
  text: string,
  model: { providerKey: string; modelId: string },
  runId: string,
): EvaluationResult {
  const parsed = modelEvaluationSchema.parse(parseModelJson(text));
  if (parsed.criterionResults.length !== request.rubricCriteria.length)
    throw new Error('The assessment did not include every rubric criterion.');

  let reviewFlag = parsed.reviewFlag;
  const reviewReasons: string[] = parsed.reviewReason
    ? [parsed.reviewReason]
    : [];
  const criterionResults = request.rubricCriteria.map((criterion, index) => {
    const result = parsed.criterionResults[index];
    if (result.criterionId !== criterion.id)
      throw new Error(
        'The assessment changed the rubric criterion order or id.',
      );
    if (
      result.proposedPoints < 0 ||
      result.proposedPoints > criterion.maxPoints
    )
      throw new Error('The assessment awarded points outside the rubric.');
    if (
      criterion.levels &&
      !criterion.levels.some((level) => level.points === result.proposedPoints)
    )
      throw new Error(
        'The assessment awarded points outside the approved rubric levels.',
      );

    let evidenceExcerpt = result.evidenceExcerpt.trim();
    if (evidenceExcerpt.toUpperCase() === 'NONE') evidenceExcerpt = '';
    if (evidenceExcerpt && !request.answer.includes(evidenceExcerpt)) {
      evidenceExcerpt = '';
      reviewFlag = true;
      reviewReasons.push(
        `Evidence for criterion ${criterion.id} was not found in the answer.`,
      );
    }
    if (result.proposedPoints > 0 && !evidenceExcerpt) {
      reviewFlag = true;
      reviewReasons.push(
        `Positive points for criterion ${criterion.id} have no quoted evidence.`,
      );
    }
    return {
      criterionId: criterion.id,
      maxPoints: criterion.maxPoints,
      proposedPoints: result.proposedPoints,
      evidenceExcerpt,
      gap: result.gap,
      rationale: result.rationale,
    };
  });
  const totalPoints = criterionResults.reduce(
    (sum, item) => sum + item.proposedPoints,
    0,
  );
  const maxPoints = criterionResults.reduce(
    (sum, item) => sum + item.maxPoints,
    0,
  );
  if (totalPoints === 0 || totalPoints === maxPoints) {
    reviewFlag = true;
    reviewReasons.push('An extreme score requires educator review.');
  }
  const derivedClassification =
    totalPoints === 0
      ? 'incorrect'
      : totalPoints === maxPoints
        ? 'correct'
        : 'partially_correct';
  if (parsed.classification !== derivedClassification) {
    reviewFlag = true;
    reviewReasons.push('Classification conflicts with the criterion score.');
  }
  return {
    // This graph run is persisted in GexamEvaluation, not the workspace Run table.
    runId,
    model,
    criterionResults,
    totalPoints,
    maxPoints,
    classification: parsed.classification,
    feedback: parsed.feedback,
    reviewFlag,
    reviewReason: reviewReasons.length
      ? [...new Set(reviewReasons)].join(' ').slice(0, 1000)
      : null,
  };
}

@Injectable()
export class GexamEvaluationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GexamEvaluationService.name);
  private readonly queued: string[] = [];
  private readonly active = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly models: ProviderRuntimeService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const pending = await this.prisma.gexamEvaluation.findMany({
      where: { status: 'PENDING' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const row of pending) this.enqueue(row.id);
  }

  assertApiKey(provided?: string): void {
    const configured = process.env.NODEGRADE_GEXAM_INTERNAL_API_KEY?.trim();
    if (!configured || configured.length < 32)
      throw new ServiceUnavailableException({
        code: 'GEXAM_INTERNAL_API_NOT_CONFIGURED',
        message: 'The Gexam service credential is not configured.',
      });
    const expected = createHash('sha256').update(configured).digest();
    const received = createHash('sha256')
      .update(provided ?? '')
      .digest();
    if (!provided || !timingSafeEqual(expected, received))
      throw new UnauthorizedException({
        code: 'GEXAM_INTERNAL_API_UNAUTHORIZED',
        message: 'Invalid service credential.',
      });
  }

  async create(body: unknown, idempotencyKey?: string) {
    if (
      !idempotencyKey ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 200
    )
      throw new BadRequestException({
        code: 'GEXAM_IDEMPOTENCY_KEY_REQUIRED',
        message: 'Provide an Idempotency-Key header of 8–200 characters.',
      });
    const parsed = evaluationRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'GEXAM_EVALUATION_INVALID',
        message: 'The Gexam evaluation request is invalid.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    const request = parsed.data;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex');
    let row = await this.prisma.gexamEvaluation.findUnique({
      where: { idempotencyKey },
    });
    if (!row) {
      try {
        row = await this.prisma.gexamEvaluation.create({
          data: {
            id: randomUUID(),
            idempotencyKey,
            requestHash,
            externalAttemptId: request.externalAttemptId,
            taskVersionId: request.taskVersionId,
            workflowRevision: request.workflowRevision,
            request,
            status: 'PENDING',
          },
        });
      } catch (error: unknown) {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 'P2002'
        )
          throw error;
        row = await this.prisma.gexamEvaluation.findUnique({
          where: { idempotencyKey },
        });
      }
    }
    if (!row) throw new Error('Could not retrieve the evaluation request.');
    if (row.requestHash !== requestHash)
      throw new ConflictException({
        code: 'GEXAM_IDEMPOTENCY_CONFLICT',
        message: 'This Idempotency-Key was already used for another request.',
      });
    if (row.status === 'PENDING') this.enqueue(row.id);
    return this.toResponse(row);
  }

  async get(id: string) {
    const row = await this.prisma.gexamEvaluation.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundException({
        code: 'GEXAM_EVALUATION_NOT_FOUND',
        message: 'No such evaluation.',
      });
    return this.toResponse(row);
  }

  private toResponse(row: NonNullable<EvaluationRecord>) {
    const base = {
      evaluationId: row.id,
      status: row.status,
      externalAttemptId: row.externalAttemptId,
      taskVersionId: row.taskVersionId,
      workflowRevision: row.workflowRevision,
      createdAt: row.createdAt.toISOString(),
    };
    if (row.status === 'COMPLETED' && row.result)
      return {
        ...base,
        ...evaluationResultSchema.parse(row.result),
        completedAt: row.completedAt?.toISOString() ?? null,
      };
    if (row.status === 'FAILED')
      return {
        ...base,
        error: {
          code: row.errorCode ?? 'GEXAM_EVALUATION_FAILED',
          message: row.errorMessage ?? 'The evaluation failed.',
        },
        completedAt: row.completedAt?.toISOString() ?? null,
      };
    return base;
  }

  private enqueue(id: string): void {
    if (this.active.has(id) || this.queued.includes(id)) return;
    this.queued.push(id);
    this.pump();
  }

  private pump(): void {
    while (this.active.size < MAX_CONCURRENT_EVALUATIONS) {
      const id = this.queued.shift();
      if (!id) return;
      this.active.add(id);
      void this.execute(id).finally(() => {
        this.active.delete(id);
        this.pump();
      });
    }
  }

  private async execute(id: string): Promise<void> {
    const row = await this.prisma.gexamEvaluation.findUnique({ where: { id } });
    if (!row || row.status !== 'PENDING') return;
    try {
      const request = evaluationRequestSchema.parse(row.request);
      const graphResult = await executeGexamGraph(request, this.models);
      const result = validateEvaluation(
        request,
        graphResult.text,
        graphResult.model,
        id,
      );
      await this.prisma.gexamEvaluation.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'COMPLETED',
          result,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(`Gexam evaluation ${id} failed.`);
      const failure = safeFailure(error);
      await this.prisma.gexamEvaluation.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          errorCode: failure.code,
          errorMessage: failure.message,
          completedAt: new Date(),
        },
      });
    }
  }
}
