import { Injectable, NotFoundException } from '@nestjs/common';
import type { OutputPresentation } from '@haski/ta-lib';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';

/** Newest records kept per workflow (SPEC-0020/FR-008). */
export const RUN_HISTORY_LIMIT = 200;
/** The graph already cuts answers at 1500 characters; this is the storage bound. */
export const ANSWER_LIMIT = 4000;
export const EXCERPT_LIMIT = 160;
/** Trace values may reach 64 KiB; a stored output is bounded far lower (NFR-002). */
export const OUTPUT_VALUE_LIMIT = 8 * 1024;
export const OUTPUTS_LIMIT = 50;
export const FLAG_REASON_LIMIT = 1000;
export const DEFAULT_LIST_LIMIT = 50;

export const RUN_FILTERS = [
  'all',
  'needs-review',
  'reviewed',
  'failed',
] as const;
export type RunFilter = (typeof RUN_FILTERS)[number];

export type RunOutcome = 'COMPLETED' | 'FAILED';

/** One output as the run emitted it, minus the run correlation. */
export type RecordedOutput = OutputPresentation & {
  uniqueId: string;
  type: string;
  label: string;
  value: unknown;
  verdict?: 'flagged' | 'clear';
  wrapperId: number | null;
  sourceId: number | null;
  truncated: boolean;
};

export type RecordRunInput = {
  runId: string;
  workspaceId: string;
  workflowId: string;
  outcome: RunOutcome;
  answer: string;
  outputs: RecordedOutput[];
  errorMessage?: string;
  submittedBy?: string;
  startedAt: Date;
  finishedAt: Date;
};

export type RunSummary = {
  id: string;
  outcome: RunOutcome;
  answerExcerpt: string;
  flagged: boolean;
  flagReason: string | null;
  /** Flagged and not yet reviewed (FR-006). */
  needsReview: boolean;
  score: number | null;
  submittedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
};

export type RunDetail = RunSummary & {
  answer: string;
  outputs: RecordedOutput[];
  errorMessage: string | null;
};

export type RunsSummary = {
  total: number;
  needsReview: number;
  reviewed: number;
  failed: number;
};

const SUMMARY_SELECT = {
  id: true,
  outcome: true,
  answer: true,
  flagged: true,
  flagReason: true,
  score: true,
  submittedBy: true,
  reviewedAt: true,
  reviewNote: true,
  startedAt: true,
  finishedAt: true,
  durationMs: true,
} as const;

type SummaryRow = Prisma.RunGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = SummaryRow & { outputs: unknown; errorMessage: string | null };

const isFlaggedReview = (output: RecordedOutput): boolean =>
  output.type === 'review' && output.verdict === 'flagged';

/** The node emits the reason as a string; anything else is not a reason. */
const reasonOf = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Bounds one stored value. The trace sanitizer already cut it at 64 KiB; a record
 * that survives 200 runs per workflow needs a much smaller ceiling.
 */
const capOutput = (output: RecordedOutput): RecordedOutput => {
  const serialized =
    typeof output.value === 'string'
      ? output.value
      : (JSON.stringify(output.value) ?? '');
  if (serialized.length <= OUTPUT_VALUE_LIMIT) return output;
  return {
    ...output,
    value: serialized.slice(0, OUTPUT_VALUE_LIMIT),
    truncated: true,
  };
};

const excerptOf = (answer: string): string =>
  answer.length <= EXCERPT_LIMIT
    ? answer
    : `${answer.slice(0, EXCERPT_LIMIT).trimEnd()}…`;

const toSummary = (row: SummaryRow): RunSummary => ({
  id: row.id,
  outcome: row.outcome,
  answerExcerpt: excerptOf(row.answer),
  flagged: row.flagged,
  flagReason: row.flagReason,
  needsReview: row.flagged && row.reviewedAt === null,
  score: row.score,
  submittedBy: row.submittedBy,
  reviewedAt: row.reviewedAt,
  reviewNote: row.reviewNote,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
  durationMs: row.durationMs,
});

const toDetail = (row: DetailRow): RunDetail => ({
  ...toSummary(row),
  answer: row.answer,
  outputs: Array.isArray(row.outputs) ? (row.outputs as RecordedOutput[]) : [],
  errorMessage: row.errorMessage,
});

/** The rows one filter selects. Every caller adds the workspace and workflow. */
const filterWhere = (filter: RunFilter): Prisma.RunWhereInput => {
  switch (filter) {
    case 'needs-review':
      return { flagged: true, reviewedAt: null };
    case 'reviewed':
      return { reviewedAt: { not: null } };
    case 'failed':
      return { outcome: 'FAILED' };
    case 'all':
      return {};
  }
};

/**
 * Run records: what the Submissions inbox reads (SPEC-0020/FR-004 to FR-008).
 *
 * Every query below carries `workspaceId` next to the id it is really after, the
 * same way `WorkflowService` does: a run id is not a credential, and a record from
 * another workspace must answer not found rather than leak.
 */
@Injectable()
export class RunService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes one record and trims the workflow's history to the newest
   * `RUN_HISTORY_LIMIT`. Two runs finishing at once may both trim; the delete is by
   * id and idempotent, so the worst case is one extra row gone.
   */
  async record(input: RecordRunInput): Promise<void> {
    const outputs = input.outputs.slice(0, OUTPUTS_LIMIT).map(capOutput);
    const reasons = outputs
      .filter(isFlaggedReview)
      .map((output) => reasonOf(output.value))
      .filter((reason) => reason !== '');
    const flagged = outputs.some(isFlaggedReview);
    const score = outputs.find(
      (output) => output.type === 'score' && typeof output.value === 'number',
    )?.value as number | undefined;
    await this.prisma.run.create({
      data: {
        id: input.runId,
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        outcome: input.outcome,
        answer: input.answer.slice(0, ANSWER_LIMIT),
        outputs: outputs as unknown as Prisma.InputJsonValue,
        score: score ?? null,
        flagged,
        flagReason: flagged
          ? reasons.join('\n').slice(0, FLAG_REASON_LIMIT) || null
          : null,
        errorMessage: input.errorMessage ?? null,
        submittedBy: input.submittedBy ?? null,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        durationMs: Math.max(
          0,
          input.finishedAt.getTime() - input.startedAt.getTime(),
        ),
      },
    });
    await this.trim(input.workspaceId, input.workflowId);
  }

  async list(
    workspaceId: string,
    workflowId: string,
    filter: RunFilter = 'all',
    limit = DEFAULT_LIST_LIMIT,
  ): Promise<{ runs: RunSummary[]; summary: RunsSummary }> {
    await this.assertWorkflow(workspaceId, workflowId);
    const scope = { workspaceId, workflowId };
    const count = (select: RunFilter) =>
      this.prisma.run.count({ where: { ...scope, ...filterWhere(select) } });
    const [rows, total, needsReview, reviewed, failed] = await Promise.all([
      this.prisma.run.findMany({
        where: { ...scope, ...filterWhere(filter) },
        select: SUMMARY_SELECT,
        orderBy: { startedAt: 'desc' },
        take: limit,
      }),
      count('all'),
      count('needs-review'),
      count('reviewed'),
      count('failed'),
    ]);
    return {
      runs: rows.map(toSummary),
      summary: { total, needsReview, reviewed, failed },
    };
  }

  async get(
    workspaceId: string,
    workflowId: string,
    runId: string,
  ): Promise<RunDetail> {
    const row = await this.prisma.run.findFirst({
      where: { id: runId, workspaceId, workflowId },
    });
    if (!row) throw this.notFound();
    return toDetail(row);
  }

  async setReview(
    workspaceId: string,
    workflowId: string,
    runId: string,
    review: { reviewed: boolean; note?: string },
  ): Promise<RunSummary> {
    const { count } = await this.prisma.run.updateMany({
      where: { id: runId, workspaceId, workflowId },
      data: review.reviewed
        ? { reviewedAt: new Date(), reviewNote: review.note?.trim() || null }
        : { reviewedAt: null, reviewNote: null },
    });
    if (count === 0) throw this.notFound();
    return this.get(workspaceId, workflowId, runId);
  }

  private async trim(workspaceId: string, workflowId: string): Promise<void> {
    const overflow = await this.prisma.run.findMany({
      where: { workspaceId, workflowId },
      orderBy: { startedAt: 'desc' },
      skip: RUN_HISTORY_LIMIT,
      select: { id: true },
    });
    if (overflow.length === 0) return;
    await this.prisma.run.deleteMany({
      where: { id: { in: overflow.map((row) => row.id) }, workspaceId },
    });
  }

  private async assertWorkflow(
    workspaceId: string,
    workflowId: string,
  ): Promise<void> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      select: { id: true },
    });
    if (!workflow)
      throw new NotFoundException({
        code: 'workflow_not_found',
        message: 'No such workflow in this workspace.',
      });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'run_not_found',
      message: 'No such run in this workspace.',
    });
  }
}
