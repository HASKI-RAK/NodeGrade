import { executeGexamGraph } from './gexam-evaluation.graph.js';
import {
  evaluationRequestSchema,
  type EvaluationRequest,
} from './gexam-evaluation.schema.js';
import { validateEvaluation } from './gexam-evaluation.service.js';

const request: EvaluationRequest = {
  externalAttemptId: 'attempt-1',
  taskVersionId: 'task-v1',
  workflowRevision: 'gexam-rubric-v1',
  question: 'Explain how an adapter connects two incompatible interfaces.',
  learningOutcome:
    'Apply the Adapter pattern to an incompatible sensor interface.',
  answer:
    'An adapter delegates to the old sensor and maps its output to a boolean.',
  referenceAnswer: 'Use an adapter to translate the interface.',
  rubricCriteria: [
    {
      id: 'pattern',
      description: 'Names the Adapter pattern',
      maxPoints: 2,
      levels: [
        { points: 0, description: 'No suitable pattern.' },
        { points: 1, description: 'Adapter mentioned.' },
        { points: 2, description: 'Adapter correctly explained.' },
      ],
    },
    {
      id: 'mapping',
      description: 'Explains delegation and mapping',
      maxPoints: 3,
    },
  ],
};

const reply = {
  criterionResults: [
    {
      criterionId: 'pattern',
      proposedPoints: 1,
      evidenceExcerpt: 'An adapter',
      gap: 'No name for the pattern.',
      rationale: 'The structure is recognized.',
    },
    {
      criterionId: 'mapping',
      proposedPoints: 3,
      evidenceExcerpt:
        'delegates to the old sensor and maps its output to a boolean',
      gap: '',
      rationale: 'Both operations are described.',
    },
  ],
  classification: 'partially_correct',
  feedback: {
    strengths: 'You identified the integration.',
    nextSteps: 'Name the pattern explicitly.',
  },
  reviewFlag: false,
  reviewReason: '',
};

describe('Gexam rubric integration', () => {
  it('rejects duplicate rubric ids before an evaluation can run', () => {
    expect(
      evaluationRequestSchema.safeParse({
        ...request,
        rubricCriteria: [request.rubricCriteria[0], request.rubricCriteria[0]],
      }).success,
    ).toBe(false);
  });

  it('computes totals from criterion points and keeps exact evidence', () => {
    const result = validateEvaluation(
      request,
      JSON.stringify(reply),
      { providerKey: 'gexam-vllm', modelId: 'model-from-catalog' },
      'evaluation-1',
    );
    expect(result.totalPoints).toBe(4);
    expect(result.maxPoints).toBe(5);
    expect(result.reviewFlag).toBe(false);
    expect(result.criterionResults[1].evidenceExcerpt).toContain('delegates');
  });

  it('flags fabricated evidence instead of displaying it as a quote', () => {
    const fabricated = {
      ...reply,
      criterionResults: [
        { ...reply.criterionResults[0], evidenceExcerpt: 'I used a factory' },
        reply.criterionResults[1],
      ],
    };
    const result = validateEvaluation(
      request,
      JSON.stringify(fabricated),
      { providerKey: 'gexam-vllm', modelId: 'model-from-catalog' },
      'evaluation-2',
    );
    expect(result.reviewFlag).toBe(true);
    expect(result.criterionResults[0].evidenceExcerpt).toBe('');
  });

  it('flags a zero or perfect score even if the model did not request review', () => {
    for (const points of [0, 1]) {
      const extreme = {
        ...reply,
        criterionResults: reply.criterionResults.map((item, index) => ({
          ...item,
          proposedPoints:
            points === 0 ? 0 : request.rubricCriteria[index].maxPoints,
          evidenceExcerpt: points === 0 ? '' : item.evidenceExcerpt,
        })),
      };
      const result = validateEvaluation(
        request,
        JSON.stringify(extreme),
        { providerKey: 'gexam-vllm', modelId: 'model-from-catalog' },
        'evaluation-extreme',
      );
      expect(result.reviewFlag).toBe(true);
      expect(result.reviewReason).toContain('extreme score');
    }
  });

  it('flags a classification that contradicts the summed rubric points', () => {
    const result = validateEvaluation(
      request,
      JSON.stringify({ ...reply, classification: 'correct' }),
      { providerKey: 'gexam-vllm', modelId: 'first' },
      'evaluation-classification',
    );
    expect(result.totalPoints).toBe(4);
    expect(result.classification).toBe('partially_correct');
    expect(result.reviewFlag).toBe(true);
    expect(result.reviewReason).toContain('Classification conflicts');
  });

  it('rejects missing criteria and out-of-range scores', () => {
    expect(() =>
      validateEvaluation(
        request,
        JSON.stringify({
          ...reply,
          criterionResults: [reply.criterionResults[0]],
        }),
        { providerKey: 'gexam-vllm', modelId: 'model-from-catalog' },
        'evaluation-3',
      ),
    ).toThrow();
    expect(() =>
      validateEvaluation(
        request,
        JSON.stringify({
          ...reply,
          criterionResults: [
            { ...reply.criterionResults[0], proposedPoints: 200 },
            reply.criterionResults[1],
          ],
        }),
        { providerKey: 'gexam-vllm', modelId: 'model-from-catalog' },
        'evaluation-4',
      ),
    ).toThrow();
  });

  it('accepts only points from teacher-approved criterion levels', () => {
    const stepped: EvaluationRequest = {
      ...request,
      rubricCriteria: [
        {
          ...request.rubricCriteria[0],
          levels: [
            { points: 0, description: 'Absent' },
            { points: 2, description: 'Complete' },
          ],
        },
        request.rubricCriteria[1],
      ],
    };
    expect(() =>
      validateEvaluation(
        stepped,
        JSON.stringify(reply),
        { providerKey: 'gexam-vllm', modelId: 'first' },
        'evaluation-levels',
      ),
    ).toThrow('approved rubric levels');
    expect(
      evaluationRequestSchema.safeParse({
        ...request,
        rubricCriteria: [
          {
            ...request.rubricCriteria[0],
            levels: [
              { points: 2, description: 'Complete' },
              { points: 0, description: 'Absent' },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('executes a NodeGrade graph with the live first model and no hidden thinking', async () => {
    const runtime = {
      firstModelForIntegration: jest.fn().mockResolvedValue({
        providerKey: 'gexam-vllm',
        modelId: 'first-model',
      }),
      complete: jest
        .fn()
        .mockResolvedValue({ text: JSON.stringify(reply), warnings: [] }),
    };
    const result = await executeGexamGraph(request, runtime);
    expect(result.model.modelId).toBe('first-model');
    expect(result.text).toBe(JSON.stringify(reply));
    expect(runtime.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        modelRef: { providerKey: 'gexam-vllm', modelId: 'first-model' },
        disableThinking: true,
        parameters: expect.not.objectContaining({ top_k: expect.any(Number) }),
      }),
    );
  });
});
