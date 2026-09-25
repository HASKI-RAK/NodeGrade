/**
 * What a workshop entry (SPEC-0022/FR-001) looks like when read, and how it resolves to
 * the revision a participant would receive.
 */

export const ENTRY_TEMPLATE_SELECT = {
  id: true,
  slug: true,
  kind: true,
  name: true,
  description: true,
  category: true,
  tags: true,
  published: true,
  deletedAt: true,
  currentRevision: true,
} as const;

export const ENTRY_SELECT = {
  id: true,
  position: true,
  templateId: true,
  templateRevisionId: true,
  template: { select: ENTRY_TEMPLATE_SELECT },
  templateRevision: { select: { id: true, revision: true } },
} as const;

export type EntryRow = {
  id: string;
  position: number;
  templateId: string;
  templateRevisionId: string | null;
  template: {
    id: string;
    slug: string;
    kind: 'WORKFLOW' | 'BLOCK';
    name: string;
    description: string | null;
    category: string | null;
    tags: string[];
    published: boolean;
    deletedAt: Date | null;
    currentRevision: number;
  };
  templateRevision: { id: string; revision: number } | null;
};

export type EntryMode = 'PINNED' | 'LATEST';

export const entryMode = (entry: {
  templateRevisionId: string | null;
}): EntryMode => (entry.templateRevisionId === null ? 'LATEST' : 'PINNED');

/**
 * Why an entry cannot be started right now, or null when it can.
 *
 * A pinned entry is always startable: its revision is immutable and outlives the
 * template's visibility (FR-002). An entry that follows the newest revision hands out
 * whatever the template currently offers, so it needs a live, published template (FR-003).
 */
export const entryUnavailableReason = (entry: EntryRow): string | null => {
  if (entryMode(entry) === 'PINNED') return null;
  if (entry.template.deletedAt !== null)
    return 'The template has been deleted.';
  if (!entry.template.published) return 'The template is not published.';
  return null;
};

export const serializeEntry = (entry: EntryRow) => ({
  id: entry.id,
  position: entry.position,
  templateId: entry.templateId,
  templateSlug: entry.template.slug,
  templateName: entry.template.name,
  mode: entryMode(entry),
  revision: entry.templateRevision?.revision ?? null,
  currentRevision: entry.template.currentRevision,
  published: entry.template.published,
  deleted: entry.template.deletedAt !== null,
});
