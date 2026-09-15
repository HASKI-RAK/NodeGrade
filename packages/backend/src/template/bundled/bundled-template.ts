import type { BlockInterfaces } from '@haski/ta-lib';
import type { TemplateKind } from '../../generated/prisma/enums.js';
import type { GraphContent } from '../template-content.js';

/**
 * A template shipped with the build (SPEC-0003/FR-002).
 *
 * These are TypeScript modules rather than JSON files read from disk. The production
 * image copies only `dist`, `prisma/` and `prisma.config.ts`, so an asset outside the
 * compiled output would simply not be there — the same trap that makes a `scripts/`
 * backfill unrunnable in production. Compiled modules cannot go missing.
 */
export type BundledTemplate = {
  slug: string;
  kind: TemplateKind;
  name: string;
  description: string;
  category: string;
  tags: string[];
  content: GraphContent;
  /** Required for BLOCK templates, meaningless for WORKFLOW ones. */
  interfaces?: BlockInterfaces;
};
