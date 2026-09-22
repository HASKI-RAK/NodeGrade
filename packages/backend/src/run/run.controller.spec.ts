import { ForbiddenException } from '@nestjs/common';
import type { ResolvedWorkspace } from '../workspace/workspace.service.js';
import { RunController } from './run.controller.js';
import type { RunDetail, RunService, RunSummary } from './run.service.js';

const summary = (): RunSummary => ({
  id: 'run-1',
  outcome: 'COMPLETED',
  answerExcerpt: 'The Earth turns.',
  flagged: true,
  flagReason: 'Unclear wording.',
  needsReview: true,
  score: null,
  submittedBy: null,
  reviewedAt: null,
  reviewNote: null,
  startedAt: new Date('2026-09-22T10:00:00.000Z'),
  finishedAt: new Date('2026-09-22T10:00:03.000Z'),
  durationMs: 3000,
});

const detail = (): RunDetail => ({
  ...summary(),
  answer: 'The Earth turns.',
  outputs: [],
  errorMessage: null,
});

const editor: ResolvedWorkspace = {
  id: 'workspace-1',
  type: 'WORKSHOP',
  label: null,
  workshopId: 'workshop-1',
};

const learner: ResolvedWorkspace = {
  ...editor,
  type: 'LTI',
  publishedProjection: true,
};

const build = () => {
  const runs = {
    list: jest.fn().mockResolvedValue({
      runs: [summary()],
      summary: { total: 1, needsReview: 1, reviewed: 0, failed: 0 },
    }),
    get: jest.fn().mockResolvedValue(detail()),
    setReview: jest.fn().mockResolvedValue({
      ...summary(),
      needsReview: false,
      reviewedAt: new Date('2026-09-22T11:00:00.000Z'),
      reviewNote: 'ok',
    }),
  };
  const controller = new RunController(runs as unknown as RunService);
  return { controller, runs };
};

describe('RunController', () => {
  it('lists with the workspace, the path workflow and defaults, serializing dates', async () => {
    const { controller, runs } = build();

    const response = await controller.list(editor, 'workflow-1', {});

    expect(runs.list).toHaveBeenCalledWith('workspace-1', 'workflow-1', 'all', 50);
    expect(response.summary).toEqual({ total: 1, needsReview: 1, reviewed: 0, failed: 0 });
    expect(response.runs[0]).toEqual(
      expect.objectContaining({
        id: 'run-1',
        startedAt: '2026-09-22T10:00:00.000Z',
        reviewedAt: null,
        needsReview: true,
      }),
    );
  });

  it('passes the filter and limit through', async () => {
    const { controller, runs } = build();

    await controller.list(editor, 'workflow-1', { filter: 'needs-review', limit: 10 });

    expect(runs.list).toHaveBeenCalledWith(
      'workspace-1',
      'workflow-1',
      'needs-review',
      10,
    );
  });

  it('wraps the detail and the review result', async () => {
    const { controller, runs } = build();

    const got = await controller.get(editor, 'workflow-1', 'run-1');
    expect(got.run).toEqual(
      expect.objectContaining({ answer: 'The Earth turns.', outputs: [] }),
    );

    const reviewed = await controller.review(editor, 'workflow-1', 'run-1', {
      reviewed: true,
      note: 'ok',
    });
    expect(runs.setReview).toHaveBeenCalledWith('workspace-1', 'workflow-1', 'run-1', {
      reviewed: true,
      note: 'ok',
    });
    expect(reviewed.run).toEqual(
      expect.objectContaining({
        reviewedAt: '2026-09-22T11:00:00.000Z',
        reviewNote: 'ok',
        needsReview: false,
      }),
    );
  });

  it('refuses every endpoint to a learner launch under the published projection', async () => {
    const { controller, runs } = build();

    await expect(controller.list(learner, 'workflow-1', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.get(learner, 'workflow-1', 'run-1')).rejects.toMatchObject({
      response: { code: 'runs_editor_only' },
    });
    await expect(
      controller.review(learner, 'workflow-1', 'run-1', { reviewed: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(runs.list).not.toHaveBeenCalled();
    expect(runs.get).not.toHaveBeenCalled();
    expect(runs.setReview).not.toHaveBeenCalled();
  });
});
