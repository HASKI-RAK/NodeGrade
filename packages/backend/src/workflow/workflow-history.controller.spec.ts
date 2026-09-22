import type { Response } from 'express';
import type { ResolvedWorkspace } from '../workspace/workspace.service.js';
import { WorkflowHistoryController } from './workflow-history.controller.js';
import { WorkflowHistoryService } from './workflow-history.service.js';
import { WorkflowService } from './workflow.service.js';

const workspace: ResolvedWorkspace = {
  id: 'ws-a',
  type: 'BROWSER',
  label: null,
  workshopId: null,
};

const learner: ResolvedWorkspace = {
  ...workspace,
  type: 'LTI',
  publishedProjection: true,
};

const version = {
  id: 'ver-1',
  version: 3,
  name: 'Rubric assessment',
  reason: 'save' as const,
  nodeCount: 4,
  createdAt: new Date('2026-09-22T11:50:00.000Z'),
};

const workflow = {
  id: 'wf-1',
  name: 'Rubric assessment',
  slug: 'rubric-assessment',
  version: 8,
  createdAt: new Date('2026-09-22T10:00:00.000Z'),
  updatedAt: new Date('2026-09-22T12:00:00.000Z'),
  publishedVersion: null,
  publishedAt: null,
  sourceTemplateId: null,
  sourceTemplateRevisionId: null,
  content: '{"nodes":[]}',
};

describe('WorkflowHistoryController', () => {
  const build = () => {
    const history = {
      list: jest.fn().mockResolvedValue([version]),
      content: jest.fn().mockResolvedValue({ ...version, content: '{}' }),
      restore: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    };
    const workflows = { get: jest.fn().mockResolvedValue(workflow) };
    const response = { setHeader: jest.fn() } as unknown as Response;
    const controller = new WorkflowHistoryController(
      history as unknown as WorkflowHistoryService,
      workflows as unknown as WorkflowService,
    );
    return { controller, history, workflows, response };
  };

  it('serializes dates as ISO strings', async () => {
    const { controller } = build();

    const result = await controller.list(workspace, 'wf-1');

    expect(result.versions[0]).toMatchObject({
      id: 'ver-1',
      reason: 'save',
      createdAt: '2026-09-22T11:50:00.000Z',
    });
  });

  it('returns the restored workflow with its new ETag (AC-003)', async () => {
    const { controller, history, response } = build();

    const result = await controller.restore(
      workspace,
      'wf-1',
      'ver-1',
      response,
    );

    expect(history.restore).toHaveBeenCalledWith('ws-a', 'wf-1', 'ver-1');
    expect(response.setHeader).toHaveBeenCalledWith('ETag', 'W/"8"');
    expect(result.content).toBe('{"nodes":[]}');
  });

  it('refuses a learner launch and touches nothing (AC-007)', async () => {
    const { controller, history } = build();

    await expect(controller.list(learner, 'wf-1')).rejects.toMatchObject({
      status: 403,
      response: { code: 'history_editor_only' },
    });
    await expect(
      controller.remove(learner, 'wf-1', 'ver-1'),
    ).rejects.toMatchObject({ status: 403 });
    expect(history.list).not.toHaveBeenCalled();
    expect(history.remove).not.toHaveBeenCalled();
  });

  it('passes the workspace, never a body, into a delete', async () => {
    const { controller, history } = build();

    await controller.remove(workspace, 'wf-1', 'ver-1');
    await controller.clear(workspace, 'wf-1');

    expect(history.remove).toHaveBeenCalledWith('ws-a', 'wf-1', 'ver-1');
    expect(history.clear).toHaveBeenCalledWith('ws-a', 'wf-1');
  });
});
