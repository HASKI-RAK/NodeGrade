import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { BUNDLED_TEMPLATES, type BundledTemplate } from './bundled/index.js';
import { hashContent } from './template-content.js';
import { TemplateService } from './template.service.js';

export type SeedResult = {
  created: number;
  updated: number;
  skipped: number;
};

/**
 * Installs the bundled templates on startup (SPEC-0003/FR-002, AC-013).
 *
 * Idempotent: a template is only touched when its bundled content hash differs from the
 * last revision the seeder itself wrote, so restarting the server — which happens on
 * every file save under `nest start --watch` — does not churn the revision history.
 */
@Injectable()
export class TemplateSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TemplateSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplateService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.TEMPLATE_SEED_ENABLED === 'false') {
      this.logger.log('Bundled template seeding disabled by configuration.');
      return;
    }

    try {
      const result = await this.seed();
      if (result.created > 0 || result.updated > 0) {
        this.logger.log(
          `Bundled templates: ${result.created} created, ${result.updated} updated, ${result.skipped} unchanged`,
        );
      }
    } catch (error) {
      // Serving must not depend on seeding; the next boot retries.
      this.logger.error('Bundled template seeding failed', error);
    }
  }

  async seed(
    bundled: BundledTemplate[] = BUNDLED_TEMPLATES,
  ): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0 };

    for (const template of bundled) {
      const outcome = await this.seedOne(template);
      result[outcome] += 1;
    }

    return result;
  }

  private async seedOne(
    bundled: BundledTemplate,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const content = JSON.stringify(bundled.content);
    const existing = await this.prisma.template.findUnique({
      where: { slug: bundled.slug },
      select: { id: true },
    });

    if (!existing) {
      await this.templates.createTemplate({
        slug: bundled.slug,
        kind: bundled.kind,
        // Published on first install only, so a fresh deployment has a usable gallery.
        // Never set again: whether a template is offered is the facilitator's call after
        // that, and a deploy must not undo an unpublish (FR-017a).
        published: true,
        revision: {
          name: bundled.name,
          description: bundled.description,
          category: bundled.category,
          tags: bundled.tags,
          content,
          interfaces: bundled.interfaces,
          origin: 'BUNDLED',
        },
      });
      return 'created';
    }

    // A facilitator who has edited this template owns it from then on. Appending a
    // bundled revision would not destroy their work, but it would move currentRevision
    // off it, so the next "use template" would silently hand out the shipped version
    // instead of theirs.
    const facilitatorEdits = await this.prisma.templateRevision.count({
      where: { templateId: existing.id, origin: 'FACILITATOR' },
    });
    if (facilitatorEdits > 0) {
      this.logger.debug(
        `Leaving template "${bundled.slug}" alone: it has facilitator revisions.`,
      );
      return 'skipped';
    }

    const lastBundled = await this.prisma.templateRevision.findFirst({
      where: { templateId: existing.id, origin: 'BUNDLED' },
      select: { contentHash: true },
      orderBy: { revision: 'desc' },
    });

    if (lastBundled?.contentHash === hashContent(content)) return 'skipped';

    await this.templates.addRevision(existing.id, {
      name: bundled.name,
      description: bundled.description,
      category: bundled.category,
      tags: bundled.tags,
      content,
      interfaces: bundled.interfaces,
      origin: 'BUNDLED',
    });
    return 'updated';
  }
}
