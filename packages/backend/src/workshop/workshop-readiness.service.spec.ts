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
      ref: { providerKey: 'openrouter', modelId: 'openrouter/free' },
      label: 'OpenRouter Free',
      providerName: 'OpenRouter',
      capabilities: { supportedParameters: [] },
    },
  ],
  providers: [
    {
      providerKey: 'openrouter',
      providerName: 'OpenRouter',
      status: 'AVAILABLE',
    },
  ],
  defaultModel: null,
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
          {
            providerKey: 'openai',
            providerName: 'OpenAI',
            status: 'UNREACHABLE',
          },
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

  it('fails when any template model node is unconfigured', async () => {
    const content = JSON.parse(JSON.stringify(waieAssessmentTemplate.content));
    content.nodes.find(
      (node: { type: string }) => node.type === 'models/llm',
    ).properties = {
      model_ref: null,
      needs_model_selection: true,
    };
    findUnique.mockResolvedValue(
      workshopRow({
        templateRevision: {
          id: 'rev-unconfigured',
          name: 'Unconfigured workflow',
          content: JSON.stringify(content),
        },
      }),
    );

    expect(await detailOf('models')).toMatchObject({
      status: 'FAIL',
      detail: expect.stringContaining('1 model node'),
    });
  });

  it('passes unconfigured model nodes when the deployment default covers them', async () => {
    const content = JSON.parse(JSON.stringify(waieAssessmentTemplate.content));
    for (const node of content.nodes.filter(
      (node: { type: string }) => node.type === 'models/llm',
    ))
      node.properties = {
        model_ref: null,
        needs_model_selection: true,
      };
    findUnique.mockResolvedValue(
      workshopRow({
        templateRevision: {
          id: 'rev-defaulted',
          name: 'Defaulted workflow',
          content: JSON.stringify(content),
        },
      }),
    );
    catalogOf.mockResolvedValue(
      catalog({
        defaultModel: { providerKey: 'openrouter', modelId: 'openrouter/free' },
      }),
    );

    expect(await detailOf('models')).toMatchObject({
      status: 'PASS',
      detail: expect.stringContaining('default model'),
    });
  });

  it('still fails unconfigured model nodes when the default is unavailable', async () => {
    const content = JSON.parse(JSON.stringify(waieAssessmentTemplate.content));
    content.nodes.find(
      (node: { type: string }) => node.type === 'models/llm',
    ).properties = {
      model_ref: null,
      needs_model_selection: true,
    };
    findUnique.mockResolvedValue(
      workshopRow({
        templateRevision: {
          id: 'rev-defaulted-stale',
          name: 'Stale default workflow',
          content: JSON.stringify(content),
        },
      }),
    );
    catalogOf.mockResolvedValue(
      catalog({
        defaultModel: { providerKey: 'openrouter', modelId: 'vanished' },
      }),
    );

    expect(await detailOf('models')).toMatchObject({
      status: 'FAIL',
      detail: expect.stringContaining('model node'),
    });
  });

  it('fails when the template-selected model is absent from the allowed catalog', async () => {
    catalogOf.mockResolvedValue(
      catalog({
        models: [
          {
            ref: { providerKey: 'openrouter', modelId: 'another/model' },
            label: 'Another model',
            providerName: 'OpenRouter',
            capabilities: { supportedParameters: [] },
          },
        ],
      }),
    );

    expect(await detailOf('models')).toMatchObject({
      status: 'FAIL',
      detail: expect.stringContaining('openrouter/openrouter/free'),
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

  it('sees nested node types and model references inside blocks', async () => {
    const content = {
      nodes: [
        {
          id: 1,
          type: 'graph/subgraph',
          title: 'Feedback Generator',
          properties: { templateBoundary: [] },
          subgraph: {
            nodes: [
              {
                id: 1,
                type: 'models/llm',
                properties: {
                  model_ref: {
                    providerKey: 'openrouter',
                    modelId: 'openrouter/free',
                  },
                  needs_model_selection: false,
                },
              },
            ],
            links: [],
          },
        },
      ],
      links: [],
    };
    findUnique.mockResolvedValue(
      workshopRow({
        templateRevision: {
          id: 'rev-nested',
          name: 'Nested workflow',
          content: JSON.stringify(content),
        },
      }),
    );

    expect(await detailOf('node_types')).toMatchObject({ status: 'PASS' });
    expect(await detailOf('models')).toMatchObject({ status: 'PASS' });
  });

  it('fails nested content with an unregistered inner type or unconfigured inner model', async () => {
    const content = {
      nodes: [
        {
          id: 1,
          type: 'graph/subgraph',
          title: 'Feedback Generator',
          properties: { templateBoundary: [] },
          subgraph: {
            nodes: [
              { id: 1, type: 'input/telepathy' },
              {
                id: 2,
                type: 'models/llm',
                properties: { model_ref: null, needs_model_selection: true },
              },
            ],
            links: [],
          },
        },
      ],
      links: [],
    };
    findUnique.mockResolvedValue(
      workshopRow({
        templateRevision: {
          id: 'rev-nested-bad',
          name: 'Nested workflow',
          content: JSON.stringify(content),
        },
      }),
    );

    expect(await detailOf('node_types')).toMatchObject({
      status: 'FAIL',
      detail: expect.stringContaining('input/telepathy'),
    });
    expect(await detailOf('models')).toMatchObject({
      status: 'FAIL',
      detail: expect.stringContaining('1 model node'),
    });
  });

  it('resolves a participant code the same way joining does', async () => {
    await service.byCode('abcd-efgh');

    expect(resolve).toHaveBeenCalledWith('abcd-efgh');
  });

  it('raises the unavailable error for an unknown workshop', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.byId('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
