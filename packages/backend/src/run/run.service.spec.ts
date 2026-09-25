import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma.service.js';
import {
  ANSWER_LIMIT,
  EXCERPT_LIMIT,
  OUTPUT_VALUE_LIMIT,
  type RecordedOutput,
  RUN_HISTORY_LIMIT,
  RunService,
} from './run.service.js';

const output = (
  overrides: Partial<RecordedOutput> & Pick<RecordedOutput, 'type' | 'value'>,
): RecordedOutput => ({
  uniqueId: '1',
  label: 'Output',
  wrapperId: null,
  sourceId: null,
  truncated: false,
  ...overrides,
});

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'run-1',
  outcome: 'COMPLETED',
  answer: 'The Earth turns.',
  outputs: [],
  flagged: false,
  flagReason: null,
  score: null,
  submittedBy: null,
  errorMessage: null,
  reviewedAt: null,
  reviewNote: null,
  startedAt: new Date('2026-09-22T10:00:00.000Z'),
  finishedAt: new Date('2026-09-22T10:00:03.000Z'),
  durationMs: 3000,
  ...overrides,
});

const build = () => {
  const run = {
    create: jest.fn().mockResolvedValue(row()),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findFirst: jest.fn().mockResolvedValue(row()),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
  };
  const workflow = {
    findFirst: jest.fn().mockResolvedValue({ id: 'workflow-1' }),
  };
  const service = new RunService({ run, workflow } as unknown as PrismaService);
  return { service, run, workflow };
};

const recordInput = (outputs: RecordedOutput[] = [], answer = 'The Earth turns.') => ({
  runId: 'run-1',
  workspaceId: 'workspace-1',
  workflowId: 'workflow-1',
  outcome: 'COMPLETED' as const,
  answer,
  outputs,
  startedAt: new Date('2026-09-22T10:00:00.000Z'),
  finishedAt: new Date('2026-09-22T10:00:03.000Z'),
});

describe('RunService.record', () => {
  it('derives the flag, its reason and the score from the emitted outputs', async () => {
    const { service, run } = build();

    await service.record(
      recordInput([
        output({ type: 'text', value: 'Well done.' }),
        output({ type: 'score', value: 80 }),
        output({ type: 'review', verdict: 'clear', value: 'Nothing wrong.' }),
        output({ type: 'review', verdict: 'flagged', value: 'Contradictory claims.' }),
      ]),
    );

    expect(run.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'run-1',
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        outcome: 'COMPLETED',
        flagged: true,
        flagReason: 'Contradictory claims.',
        score: 80,
        durationMs: 3000,
      }),
    });
  });

  it('leaves a run without a flagged review unflagged', async () => {
    const { service, run } = build();

    await service.record(
      recordInput([output({ type: 'review', verdict: 'clear', value: 'Fine.' })]),
    );

    expect(run.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ flagged: false, flagReason: null, score: null }),
    );
  });

  it('caps the answer and every stored value', async () => {
    const { service, run } = build();
    const long = 'x'.repeat(OUTPUT_VALUE_LIMIT + 10);

    await service.record(
      recordInput([output({ type: 'text', value: long })], 'a'.repeat(ANSWER_LIMIT + 5)),
    );

    const data = run.create.mock.calls[0][0].data;
    expect(data.answer).toHaveLength(ANSWER_LIMIT);
    expect(data.outputs[0]).toEqual(
      expect.objectContaining({ value: 'x'.repeat(OUTPUT_VALUE_LIMIT), truncated: true }),
    );
  });

  it('trims the workflow history to the newest records inside the workspace', async () => {
    const { service, run } = build();
    run.findMany.mockResolvedValueOnce([{ id: 'old-1' }, { id: 'old-2' }]);

    await service.record(recordInput());

    expect(run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', workflowId: 'workflow-1' },
        orderBy: { startedAt: 'desc' },
        skip: RUN_HISTORY_LIMIT,
      }),
    );
    expect(run.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1', 'old-2'] }, workspaceId: 'workspace-1' },
    });
  });

  it('skips the delete when nothing overflows', async () => {
    const { service, run } = build();

    await service.record(recordInput());

    expect(run.deleteMany).not.toHaveBeenCalled();
  });
});

describe('RunService.list', () => {
  it('refuses a workflow outside the workspace before touching runs', async () => {
    const { service, run, workflow } = build();
    workflow.findFirst.mockResolvedValueOnce(null);

    await expect(service.list('workspace-1', 'workflow-2')).rejects.toMatchObject({
      response: { code: 'workflow_not_found' },
    });
    expect(workflow.findFirst).toHaveBeenCalledWith({
      where: { id: 'workflow-2', workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(run.findMany).not.toHaveBeenCalled();
  });

  it('scopes the list and every count to the workspace and applies the filter', async () => {
    const { service, run } = build();
    run.findMany.mockResolvedValueOnce([
      row({ flagged: true }),
      row({ id: 'run-2', flagged: true, reviewedAt: new Date() }),
    ]);
    run.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    const result = await service.list('workspace-1', 'workflow-1', 'needs-review', 20);

    expect(run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          workflowId: 'workflow-1',
          flagged: true,
          reviewedAt: null,
        },
        orderBy: { startedAt: 'desc' },
        take: 20,
      }),
    );
    for (const [call] of run.count.mock.calls)
      expect(call.where).toEqual(
        expect.objectContaining({ workspaceId: 'workspace-1', workflowId: 'workflow-1' }),
      );
    expect(run.count.mock.calls.map(([call]) => call.where)).toEqual([
      { workspaceId: 'workspace-1', workflowId: 'workflow-1' },
      expect.objectContaining({ flagged: true, reviewedAt: null }),
      expect.objectContaining({ reviewedAt: { not: null } }),
      expect.objectContaining({ outcome: 'FAILED' }),
    ]);
    expect(result.summary).toEqual({ total: 5, needsReview: 1, reviewed: 2, failed: 1 });
    expect(result.runs.map((entry) => entry.needsReview)).toEqual([true, false]);
  });

  it('shortens the answer to an excerpt and never returns outputs', async () => {
    const { service, run } = build();
    run.findMany.mockResolvedValueOnce([row({ answer: 'y'.repeat(EXCERPT_LIMIT + 20) })]);

    const { runs } = await service.list('workspace-1', 'workflow-1');

    expect(runs[0].answerExcerpt).toHaveLength(EXCERPT_LIMIT + 1);
    expect(runs[0].answerExcerpt.endsWith('…')).toBe(true);
    expect(runs[0]).not.toHaveProperty('outputs');
    expect(run.findMany.mock.calls[0][0].select).not.toHaveProperty('outputs');
  });
});

describe('RunService.get and setReview', () => {
  it('reads a run only inside its workspace and workflow', async () => {
    const { service, run } = build();
    run.findFirst.mockResolvedValueOnce(null);

    await expect(service.get('workspace-1', 'workflow-1', 'run-9')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(run.findFirst).toHaveBeenCalledWith({
      where: { id: 'run-9', workspaceId: 'workspace-1', workflowId: 'workflow-1' },
    });
  });

  it('returns the stored outputs and error with the detail', async () => {
    const { service, run } = build();
    const outputs = [output({ type: 'review', verdict: 'flagged', value: 'Why.' })];
    run.findFirst.mockResolvedValueOnce(
      row({ outputs, flagged: true, flagReason: 'Why.', errorMessage: null }),
    );

    const detail = await service.get('workspace-1', 'workflow-1', 'run-1');

    expect(detail.outputs).toEqual(outputs);
    expect(detail.needsReview).toBe(true);
    expect(detail.answer).toBe('The Earth turns.');
  });

  it('marks a run reviewed with a note and clears both on reopen', async () => {
    const { service, run } = build();

    await service.setReview('workspace-1', 'workflow-1', 'run-1', {
      reviewed: true,
      note: '  Looked at it.  ',
    });
    expect(run.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', workspaceId: 'workspace-1', workflowId: 'workflow-1' },
      data: { reviewedAt: expect.any(Date), reviewNote: 'Looked at it.' },
    });

    await service.setReview('workspace-1', 'workflow-1', 'run-1', { reviewed: false });
    expect(run.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'run-1', workspaceId: 'workspace-1', workflowId: 'workflow-1' },
      data: { reviewedAt: null, reviewNote: null },
    });
  });

  it('answers not found when the review targets a run outside the workspace', async () => {
    const { service, run } = build();
    run.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.setReview('workspace-1', 'workflow-1', 'run-9', { reviewed: true }),
    ).rejects.toMatchObject({ response: { code: 'run_not_found' } });
    expect(run.findFirst).not.toHaveBeenCalled();
  });
});
