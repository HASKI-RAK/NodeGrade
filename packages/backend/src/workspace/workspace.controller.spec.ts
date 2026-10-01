import type { Request, Response } from 'express';
import { WorkspaceController } from './workspace.controller.js';
import { WorkspaceCreationThrottle } from './workspace-creation-throttle.js';
import type { CreatedWorkspace, WorkspaceService } from './workspace.service.js';

const created: CreatedWorkspace = {
  id: 'ws-1',
  type: 'BROWSER',
  label: null,
  workshopId: null,
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  token: 'ngw_token',
};

describe('WorkspaceController', () => {
  const build = (retryAfterMs = 0) => {
    const workspaces = {
      createBrowser: jest.fn().mockResolvedValue(created),
    };
    const throttle = {
      retryAfterMs: jest.fn().mockReturnValue(retryAfterMs),
      record: jest.fn(),
    };
    const controller = new WorkspaceController(
      workspaces as unknown as WorkspaceService,
      throttle as unknown as WorkspaceCreationThrottle,
    );
    const response = { setHeader: jest.fn() } as unknown as Response;
    const request = { ip: '203.0.113.9' } as unknown as Request;
    return { controller, workspaces, throttle, request, response };
  };

  it('mints a browser workspace and returns the token once (SPEC-0004/FR-003)', async () => {
    const { controller, workspaces, throttle, request, response } = build();

    const result = await controller.create({ label: 'Mine' }, request, response);

    expect(workspaces.createBrowser).toHaveBeenCalledWith('Mine');
    expect(throttle.record).toHaveBeenCalledWith('203.0.113.9');
    expect(result).toEqual({
      workspace: {
        id: 'ws-1',
        type: 'BROWSER',
        label: null,
        workshopId: null,
        createdAt: '2026-10-01T10:00:00.000Z',
      },
      token: 'ngw_token',
    });
  });

  it('refuses a throttled address with Retry-After (SPEC-0022/FR-015)', async () => {
    const { controller, workspaces, throttle, request, response } = build(2500);

    await expect(
      controller.create({}, request, response),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'too_many_requests' },
    });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '3');
    expect(throttle.record).not.toHaveBeenCalled();
    expect(workspaces.createBrowser).not.toHaveBeenCalled();
  });
});
