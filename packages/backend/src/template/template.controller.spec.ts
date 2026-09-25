import { AdminTemplateController } from './admin-template.controller.js';
import { TemplateController } from './template.controller.js';
import { TemplateService } from './template.service.js';

const template = {
  id: 'tpl-1',
  slug: 'demo',
  kind: 'WORKFLOW' as const,
  name: 'Demo',
  description: 'A demo',
  category: 'Getting started',
  tags: ['demo'],
  published: true,
  currentRevision: 2,
  deletedAt: null,
  createdAt: new Date('2026-09-15T10:00:00.000Z'),
  updatedAt: new Date('2026-09-15T11:00:00.000Z'),
};

const revision = {
  id: 'rev-2',
  templateId: 'tpl-1',
  revision: 2,
  origin: 'BUNDLED' as const,
  name: 'Demo',
  description: 'A demo',
  category: 'Getting started',
  tags: ['demo'],
  content: '{"nodes":[{"id":1,"type":"models/llm"}]}',
  contentHash: 'hash',
  contentSchema: 2,
  interfaces: null,
  createdAt: new Date('2026-09-15T11:00:00.000Z'),
};

const build = () => {
  const templates = {
    listPublished: jest.fn().mockResolvedValue([template]),
    listAll: jest.fn().mockResolvedValue([template]),
    listRevisions: jest.fn().mockResolvedValue([revision]),
    findBySlug: jest.fn().mockResolvedValue(template),
    findById: jest.fn().mockResolvedValue(template),
    getCurrentRevision: jest.fn().mockResolvedValue(revision),
    getRevision: jest.fn().mockResolvedValue(revision),
    requiredNodeTypes: jest.fn().mockReturnValue(['models/llm']),
    softDelete: jest.fn().mockResolvedValue({ ...template, published: false }),
    setPublished: jest.fn().mockResolvedValue(template),
    deleteRevision: jest.fn().mockResolvedValue(undefined),
  } as unknown as TemplateService;

  return {
    gallery: new TemplateController(templates),
    admin: new AdminTemplateController(templates),
    templates: templates as unknown as Record<string, jest.Mock>,
  };
};

describe('TemplateController', () => {
  const block = { ...template, kind: 'BLOCK' as const };

  it('lists published blocks only (SPEC-0022/FR-014)', async () => {
    const { gallery, templates } = build();

    await gallery.list();

    expect(templates.listPublished).toHaveBeenCalledWith('BLOCK');
  });

  it('resolves a block by slug, published only (FR-017)', async () => {
    const { gallery, templates } = build();
    templates.findBySlug.mockResolvedValue(block);

    const result = await gallery.get('demo');

    expect(templates.findBySlug).toHaveBeenCalledWith('demo', true);
    expect(result.revision.content).toBe(revision.content);
    expect(result.revision.requiredNodeTypes).toEqual(['models/llm']);
  });

  it('does not serve a workflow template (SPEC-0022/AC-011)', async () => {
    const { gallery, templates } = build();

    await expect(gallery.get('demo')).rejects.toMatchObject({ status: 404 });
    expect(templates.getCurrentRevision).not.toHaveBeenCalled();
  });
});

describe('AdminTemplateController', () => {
  it('shows unpublished templates to the facilitator (AC-010)', async () => {
    const { admin, templates } = build();

    await admin.list({ includeDeleted: true });

    expect(templates.listAll).toHaveBeenCalledWith(undefined, true);
  });

  it('defaults to hiding deleted templates', async () => {
    const { admin, templates } = build();

    await admin.list({});

    expect(templates.listAll).toHaveBeenCalledWith(undefined, false);
  });

  it('lists revisions without their content', async () => {
    const { admin } = build();

    const result = await admin.get('tpl-1');

    expect(result.revisions[0]).not.toHaveProperty('content');
    expect(result.revisions[0].revision).toBe(2);
  });

  it('resolves a template regardless of published state', async () => {
    const { admin, templates } = build();

    await admin.get('tpl-1');

    expect(templates.findById).toHaveBeenCalledWith('tpl-1', false);
  });
});
