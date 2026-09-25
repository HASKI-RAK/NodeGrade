import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma.service.js';
import { TOUCH_INTERVAL_MS, WorkspaceService } from './workspace.service.js';
import {
  WORKSPACE_TOKEN_PREFIX,
  hashWorkspaceToken,
} from './workspace-token.js';

const VALID_TOKEN = `${WORKSPACE_TOKEN_PREFIX}${'a'.repeat(43)}`;

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let workspace: {
    create: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };

  beforeEach(async () => {
    workspace = {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: PrismaService, useValue: { workspace } },
      ],
    }).compile();

    service = module.get(WorkspaceService);
  });

  describe('createWorkshop', () => {
    it('stores only the hash and returns the token once', async () => {
      workspace.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'ws1',
          type: data.type,
          label: data.label,
          workshopId: data.workshopId,
          createdAt: new Date(),
        }),
      );

      const created = await service.createWorkshop('wk1', 'Workshop');

      const stored = workspace.create.mock.calls[0][0].data;
      expect(stored.type).toBe('WORKSHOP');
      expect(stored.workshopId).toBe('wk1');
      expect(stored.tokenHash).toBe(hashWorkspaceToken(created.token));
      expect(JSON.stringify(stored)).not.toContain(created.token);
    });
  });

  describe('resolveByToken', () => {
    it('never queries for a malformed token', async () => {
      await expect(service.resolveByToken('nope')).resolves.toBeNull();
      await expect(service.resolveByToken(undefined)).resolves.toBeNull();
      expect(workspace.findUnique).not.toHaveBeenCalled();
    });

    it('looks the workspace up by token hash, not by id', async () => {
      workspace.findUnique.mockResolvedValue({
        id: 'ws1',
        type: 'BROWSER',
        label: null,
        workshopId: null,
        lastActiveAt: new Date(),
      });

      await service.resolveByToken(VALID_TOKEN);

      expect(workspace.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: hashWorkspaceToken(VALID_TOKEN) },
        }),
      );
    });

    it('rejects a browser workspace token (SPEC-0022/FR-013)', async () => {
      workspace.findUnique.mockResolvedValue({
        id: 'ws1',
        type: 'BROWSER',
        label: null,
        workshopId: null,
        lastActiveAt: new Date(),
        workshop: null,
      });

      await expect(service.resolveByToken(VALID_TOKEN)).resolves.toBeNull();
      expect(workspace.updateMany).not.toHaveBeenCalled();
    });

    it('returns null for an unknown token', async () => {
      workspace.findUnique.mockResolvedValue(null);
      await expect(service.resolveByToken(VALID_TOKEN)).resolves.toBeNull();
    });

    it('does not leak lastActiveAt into the resolved workspace', async () => {
      workspace.findUnique.mockResolvedValue({
        id: 'ws1',
        type: 'WORKSHOP',
        label: null,
        workshopId: 'wk1',
        lastActiveAt: new Date(),
      });

      const resolved = await service.resolveByToken(VALID_TOKEN);

      expect(resolved).toEqual({
        id: 'ws1',
        type: 'WORKSHOP',
        label: null,
        workshopId: 'wk1',
        workshop: null,
      });
    });

    it.each([
      ['a published workshop', 'PUBLISHED', null, false],
      ['a closed workshop', 'CLOSED', null, true],
      [
        'an expired workshop',
        'PUBLISHED',
        new Date('2026-09-25T09:00:00.000Z'),
        true,
      ],
    ])(
      'describes %s to its participant (SPEC-0022/FR-011)',
      async (_label, status, expiresAt, readOnly) => {
        workspace.findUnique.mockResolvedValue({
          id: 'ws1',
          type: 'WORKSHOP',
          label: 'Workshop',
          workshopId: 'wk1',
          lastActiveAt: new Date('2026-09-25T09:59:00.000Z'),
          workshop: { code: 'ABCDEFGH', title: 'Workshop', status, expiresAt },
        });

        const resolved = await service.resolveByToken(
          VALID_TOKEN,
          new Date('2026-09-25T10:00:00.000Z'),
        );

        expect(resolved?.workshop).toEqual({
          code: 'ABCD-EFGH',
          title: 'Workshop',
          readOnly,
        });
      },
    );
  });

  describe('workshopState', () => {
    it('reads the workshop fresh for a workspace id', async () => {
      workspace.findUnique.mockResolvedValue({
        workshop: {
          code: 'ABCDEFGH',
          title: 'Workshop',
          status: 'CLOSED',
          expiresAt: null,
        },
      });

      await expect(service.workshopState('ws1')).resolves.toEqual({
        code: 'ABCD-EFGH',
        title: 'Workshop',
        readOnly: true,
      });
      expect(workspace.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ws1' } }),
      );
    });

    it('has no workshop state for a workspace outside a workshop', async () => {
      workspace.findUnique.mockResolvedValue({ workshop: null });

      await expect(service.workshopState('ws1')).resolves.toBeNull();
    });
  });

  describe('touch', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');

    it('skips the write when the workspace was seen recently', async () => {
      const recent = new Date(now.getTime() - TOUCH_INTERVAL_MS + 1000);

      await service.touch('ws1', recent, now);

      expect(workspace.updateMany).not.toHaveBeenCalled();
    });

    it('writes conditionally so two concurrent requests cannot race', async () => {
      const stale = new Date(now.getTime() - TOUCH_INTERVAL_MS - 1000);

      await service.touch('ws1', stale, now);

      expect(workspace.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'ws1',
          lastActiveAt: { lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) },
        },
        data: { lastActiveAt: now },
      });
    });
  });
});
