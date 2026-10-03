import { z } from 'zod';

export const GEXAM_WORKFLOW_REVISION = 'gexam-rubric-v1';

const criterionSchema = z
  .object({
    id: z.string().min(1).max(120),
    description: z.string().min(3).max(3000),
    maxPoints: z.number().int().min(1).max(100),
    levels: z
      .array(
        z
          .object({
            points: z.number().int().min(0).max(100),
            description: z.string().min(1).max(1000),
          })
          .strict(),
      )
      .min(2)
      .max(5)
      .optional(),
  })
  .strict();

export const evaluationRequestSchema = z
  .object({
    externalAttemptId: z.string().min(1).max(200),
    taskVersionId: z.string().min(1).max(200),
    workflowRevision: z.literal(GEXAM_WORKFLOW_REVISION),
    question: z.string().min(5).max(8000),
    learningOutcome: z.string().min(3).max(2000).optional(),
    answer: z.string().min(1).max(4000),
    rubricCriteria: z.array(criterionSchema).min(1).max(8),
    referenceAnswer: z.string().max(8000).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    const ids = request.rubricCriteria.map((criterion) => criterion.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: 'custom',
        path: ['rubricCriteria'],
        message: 'Criterion ids must be unique.',
      });
    request.rubricCriteria.forEach((criterion, index) => {
      if (!criterion.levels) return;
      const points = criterion.levels.map((level) => level.points);
      if (
        points[0] !== 0 ||
        points[points.length - 1] !== criterion.maxPoints ||
        points.some(
          (value, position) => position > 0 && value <= points[position - 1],
        )
      )
        context.addIssue({
          code: 'custom',
          path: ['rubricCriteria', index, 'levels'],
          message:
            'Criterion levels must be sorted, unique, and run from 0 to maxPoints.',
        });
    });
  });

export type EvaluationRequest = z.infer<typeof evaluationRequestSchema>;

export const modelEvaluationSchema = z
  .object({
    criterionResults: z.array(
      z
        .object({
          criterionId: z.string(),
          proposedPoints: z.number().int(),
          evidenceExcerpt: z.string().max(600),
          gap: z.string().max(1000),
          rationale: z.string().min(1).max(1500),
        })
        .strict(),
    ),
    classification: z.enum(['correct', 'partially_correct', 'incorrect']),
    feedback: z
      .object({
        strengths: z.string().max(1200),
        nextSteps: z.string().min(1).max(1200),
      })
      .strict(),
    reviewFlag: z.boolean(),
    reviewReason: z.string().max(1000).optional(),
  })
  .strict();

export const evaluationResultSchema = z
  .object({
    runId: z.string(),
    model: z.object({ providerKey: z.string(), modelId: z.string() }).strict(),
    criterionResults: z.array(
      z
        .object({
          criterionId: z.string(),
          maxPoints: z.number(),
          proposedPoints: z.number(),
          evidenceExcerpt: z.string(),
          gap: z.string(),
          rationale: z.string(),
        })
        .strict(),
    ),
    totalPoints: z.number(),
    maxPoints: z.number(),
    classification: z.enum(['correct', 'partially_correct', 'incorrect']),
    feedback: z
      .object({ strengths: z.string(), nextSteps: z.string() })
      .strict(),
    reviewFlag: z.boolean(),
    reviewReason: z.string().nullable(),
  })
  .strict();

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
