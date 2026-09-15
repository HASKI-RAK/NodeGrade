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
  it('lists only published templates', async () => {
    const { gallery, templates } = build();

    const result = await gallery.list({ kind: 'WORKFLOW' });

    expect(templates.listPublished).toHaveBeenCalledWith('WORKFLOW');
    expect(result.templates[0].slug).toBe('demo');
  });

  it('resolves a template by slug, published only (FR-017)', async () => {
    const { gallery, templates } = build();

    await gallery.get('demo');

    expect(templates.findBySlug).toHaveBeenCalledWith('demo', true);
  });

  it('includes content and required node types for the preview', async () => {
    const { gallery } = build();

    const result = await gallery.get('demo');

    expect(result.revision.content).toBe(revision.content);
    expect(result.revision.requiredNodeTypes).toEqual(['models/llm']);
  });

  it('serves a pinned revision by id', async () => {
    const { gallery, templates } = build();

    const result = await gallery.revision('rev-2');

    expect(templates.getRevision).toHaveBeenCalledWith('rev-2');
    expect(result.revision.content).toBe(revision.content);
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
