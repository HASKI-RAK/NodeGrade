import { PrismaService } from '../prisma.service.js';
import type { BundledTemplate } from './bundled/index.js';
import { hashContent } from './template-content.js';
import { TemplateSeedService } from './template-seed.service.js';
import { TemplateService } from './template.service.js';

const bundled: BundledTemplate = {
  slug: 'demo',
  kind: 'WORKFLOW',
  name: 'Demo',
  description: 'A demo',
  category: 'Getting started',
  tags: ['demo'],
  content: { nodes: [{ id: 1, type: 'input/answer' }] },
};

const BUNDLED_HASH = hashContent(JSON.stringify(bundled.content));

const build = () => {
  const template = { findUnique: jest.fn().mockResolvedValue(null) };
  const templateRevision = {
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
  };
  const templates = {
    createTemplate: jest.fn().mockResolvedValue({}),
    addRevision: jest.fn().mockResolvedValue({}),
  };

  const service = new TemplateSeedService(
    { template, templateRevision } as unknown as PrismaService,
    templates as unknown as TemplateService,
  );

  return { service, template, templateRevision, templates };
};

describe('TemplateSeedService', () => {
  it('installs a bundled template on a fresh deployment (AC-013)', async () => {
    const { service, templates } = build();

    await expect(service.seed([bundled])).resolves.toEqual({
      created: 1,
      updated: 0,
      skipped: 0,
    });

    expect(templates.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'demo',
        kind: 'WORKFLOW',
        published: true,
      }),
    );
  });

  it('marks the first revision as bundled, so it can recognise its own work', async () => {
    const { service, templates } = build();

    await service.seed([bundled]);

    expect(templates.createTemplate.mock.calls[0][0].revision.origin).toBe(
      'BUNDLED',
    );
  });

  it('does nothing on restart when the content has not changed', async () => {
    const { service, template, templateRevision, templates } = build();
    template.findUnique.mockResolvedValue({ id: 'tpl-1' });
    templateRevision.findFirst.mockResolvedValue({
      contentHash: BUNDLED_HASH,
    });

    await expect(service.seed([bundled])).resolves.toEqual({
      created: 0,
      updated: 0,
      skipped: 1,
    });
    expect(templates.addRevision).not.toHaveBeenCalled();
  });

  it('appends a revision when the shipped content changed', async () => {
    const { service, template, templateRevision, templates } = build();
    template.findUnique.mockResolvedValue({ id: 'tpl-1' });
    templateRevision.findFirst.mockResolvedValue({
      contentHash: 'an-older-hash',
    });

    await expect(service.seed([bundled])).resolves.toEqual({
      created: 0,
      updated: 1,
      skipped: 0,
    });
    expect(templates.addRevision).toHaveBeenCalledWith(
      'tpl-1',
      expect.objectContaining({ origin: 'BUNDLED' }),
    );
  });

  it('leaves a facilitator-edited template alone', async () => {
    const { service, template, templateRevision, templates } = build();
    template.findUnique.mockResolvedValue({ id: 'tpl-1' });
    templateRevision.count.mockResolvedValue(1);
    templateRevision.findFirst.mockResolvedValue({
      contentHash: 'an-older-hash',
    });

    await expect(service.seed([bundled])).resolves.toEqual({
      created: 0,
      updated: 0,
      skipped: 1,
    });
    // Appending would not destroy their revision, but it would move currentRevision off
    // it, so the next "use template" would hand out the shipped version instead.
    expect(templates.addRevision).not.toHaveBeenCalled();
  });

  it('never re-publishes an existing template', async () => {
    const { service, template, templateRevision, templates } = build();
    template.findUnique.mockResolvedValue({ id: 'tpl-1' });
    templateRevision.findFirst.mockResolvedValue({ contentHash: 'older' });

    await service.seed([bundled]);

    // A deploy must not undo a facilitator's unpublish (FR-017a).
    expect(templates.addRevision.mock.calls[0][1]).not.toHaveProperty(
      'published',
    );
  });

  it('can be switched off', async () => {
    const { service, templates } = build();
    const previous = process.env.TEMPLATE_SEED_ENABLED;
    process.env.TEMPLATE_SEED_ENABLED = 'false';

    try {
      await service.onApplicationBootstrap();
      expect(templates.createTemplate).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.TEMPLATE_SEED_ENABLED;
      else process.env.TEMPLATE_SEED_ENABLED = previous;
    }
  });

  it('does not stop the server when seeding fails', async () => {
    const { service, templates } = build();
    templates.createTemplate.mockRejectedValue(new Error('database is down'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
