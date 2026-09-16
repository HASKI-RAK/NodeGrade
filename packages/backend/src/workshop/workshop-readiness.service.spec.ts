import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ModelCatalog } from '@haski/ta-lib';
import { PrismaService } from '../prisma.service.js';
import { ProviderRuntimeService } from '../provider/provider-runtime.service.js';
import { waieAssessmentTemplate } from '../template/bundled/waie-assessment.js';
import {
  WorkshopReadinessService,
  type ReadinessCheckId,
} from './workshop-readiness.service.js';
import { WorkshopService } from './workshop.service.js';

const workshopRow = (
  overrides: Partial<{
    template: { published: boolean; deletedAt: Date | null };
    templateRevision: { id: string; name: string; content: string } | null;
  }> = {},
) => ({
  id: 'shop-1',
  status: 'PUBLISHED' as const,
  template: { published: true, deletedAt: null },
  templateRevision: {
    id: 'rev-1',
    name: 'WAIE free-text assessment',
    content: JSON.stringify(waieAssessmentTemplate.content),
  },
  ...overrides,
});

const catalog = (overrides: Partial<ModelCatalog> = {}): ModelCatalog => ({
  models: [
    {
      ref: { providerKey: 'openai', modelId: 'gpt-4o-mini' },
      label: 'GPT-4o mini',
      providerName: 'OpenAI',
      capabilities: { supportedParameters: [] },
    },
  ],
  providers: [
    { providerKey: 'openai', providerName: 'OpenAI', status: 'AVAILABLE' },
  ],
  ...overrides,
});

describe('WorkshopReadinessService', () => {
  const findUnique = jest.fn();
  const catalogOf = jest.fn();
  const resolve = jest.fn();
  let service: WorkshopReadinessService;

  const detailOf = async (id: ReadinessCheckId) => {
    const result = await service.byId('shop-1');
    return result.checks.find((check) => check.id === id);
  };

  beforeEach(async () => {
    findUnique.mockReset().mockResolvedValue(workshopRow());
    catalogOf.mockReset().mockResolvedValue(catalog());
    resolve.mockReset().mockResolvedValue({ id: 'shop-1' });

    const module = await Test.createTestingModule({
      providers: [
        WorkshopReadinessService,
        { provide: PrismaService, useValue: { workshop: { findUnique } } },
        { provide: ProviderRuntimeService, useValue: { catalog: catalogOf } },
        { provide: WorkshopService, useValue: { resolve } },
      ],
    }).compile();
    service = module.get(WorkshopReadinessService);
  });

  it('passes every check for a published workshop on a reachable provider', async () => {
    const result = await service.byId('shop-1');

    expect(result.status).toBe('PASS');
    expect(result.checks.map((check) => check.id)).toEqual([
      'backend',
      'template',
      'node_types',
      'models',
    ]);
    expect(result.checks.every((check) => check.status === 'PASS')).toBe(true);
  });

  it('fails when no model is allowed or no provider is reachable (AC-007)', async () => {
    catalogOf.mockResolvedValue(
      catalog({
        models: [],
        providers: [
          { providerKey: 'openai', providerName: 'OpenAI', status: 'UNREACHABLE' },
        ],
      }),
    );

    const result = await service.byId('shop-1');

    expect(result.status).toBe('FAIL');
    expect(result.checks.find((check) => check.id === 'models')).toMatchObject({
      status: 'FAIL',
      detail: expect.stringContaining('UNREACHABLE'),
    });
  });

  it('fails when a reachable provider allows no model', async () => {
    catalogOf.mockResolvedValue(catalog({ models: [] }));

    expect(await detailOf('models')).toMatchObject({
      status: 'FAIL',
      detail: expect.stringContaining('No model is allowed'),
    });
  });

  it('fails when the template is unpublished or deleted', async () => {
    findUnique.mockResolvedValue(
      workshopRow({ template: { published: false, deletedAt: null } }),
    );

    expect(await detailOf('template')).toMatchObject({
      status: 'FAIL',
      detail: 'The template is not published.',
    });
  });

  it('fails when the template needs a node type this build does not register', async () => {
    findUnique.mockResolvedValue(
      workshopRow({
        templateRevision: {
          id: 'rev-2',
          name: 'Future workflow',
          content: JSON.stringify({
            nodes: [{ id: 1, type: 'input/telepathy' }],
          }),
        },
      }),
    );

    expect(await detailOf('node_types')).toMatchObject({
      status: 'FAIL',
      detail: expect.stringContaining('input/telepathy'),
    });
  });

  it('reports unreadable template content as a failing check', async () => {
    findUnique.mockResolvedValue(
      workshopRow({
        templateRevision: { id: 'rev-3', name: 'Broken', content: 'not json' },
      }),
    );

    expect(await detailOf('node_types')).toMatchObject({ status: 'FAIL' });
  });

  it('resolves a participant code the same way joining does', async () => {
    await service.byCode('abcd-efgh');

    expect(resolve).toHaveBeenCalledWith('abcd-efgh');
  });

  it('raises the unavailable error for an unknown workshop', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.byId('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
