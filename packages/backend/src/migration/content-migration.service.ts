import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { ProviderRuntimeService } from '../provider/provider-runtime.service.js';
import { ProviderService } from '../provider/provider.service.js';
import {
  CONTENT_SCHEMA_VERSION,
  TransformOptions,
  transformLlmModelRefs,
} from './transform-llm-model-ref.js';

const BATCH_SIZE = 200;

/**
 * Converts stored workflow and template content to the current content schema.
 *
 * Runs in-process rather than as a script under scripts/, because the production runtime
 * image copies only dist/, prisma/ and prisma.config.ts -- a script would not exist
 * there, and the only migration hook is the Dockerfile CMD. A backfill an operator has
 * to remember to run is a backfill that will not run.
 *
 * Idempotent by construction: once a row is stamped with the current contentSchema the
 * query no longer selects it, so a crash mid-batch simply resumes.
 */
@Injectable()
export class ContentMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ContentMigrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderService,
    private readonly runtime: ProviderRuntimeService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.CONTENT_MIGRATION_ENABLED === 'false') {
      this.logger.log('Content migration disabled by configuration.');
      return;
    }

    try {
      await this.migrate();
    } catch (error) {
      // A failed content migration must not stop the server from serving: unconverted
      // rows stay selectable and the next boot retries them.
      this.logger.error(
        'Content migration failed; will retry on next boot',
        error,
      );
    }
  }

  async migrate(): Promise<{ workflows: number; revisions: number }> {
    await this.providers.ensureInitialized();
    const enabledProviderKeys = await this.enabledProviderKeys();
    const catalog = await this.runtime.catalog();
    const options: TransformOptions = {
      enabledProviderKeys,
      availableModels: catalog.models.map((model) => model.ref),
    };
    const workflows = await this.migrateWorkflows(options);
    const revisions = await this.migrateTemplateRevisions(options);

    if (workflows > 0 || revisions > 0) {
      this.logger.log(
        `Content migration complete: ${workflows} workflows, ${revisions} template revisions`,
      );
    }

    return { workflows, revisions };
  }

  /**
   * Which providers a bare model id could plausibly belong to. Empty until the provider
   * seeder runs, in which case ambiguous references are left for explicit selection
   * rather than resolved wrongly.
   */
  private async enabledProviderKeys(): Promise<string[]> {
    const providers = await this.prisma.provider.findMany({
      where: { enabled: true },
      select: { key: true },
    });
    return providers.map((provider) => provider.key);
  }

  private async migrateWorkflows(options: TransformOptions): Promise<number> {
    let migrated = 0;
    let needingSelection = 0;

    for (;;) {
      const batch = await this.prisma.workflow.findMany({
        where: { contentSchema: { lt: CONTENT_SCHEMA_VERSION } },
        select: { id: true, content: true },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;

      for (const workflow of batch) {
        const result = this.transform(workflow.id, workflow.content, options);
        needingSelection += result.needingSelection;

        await this.prisma.workflow.update({
          where: { id: workflow.id },
          data: {
            content: result.content,
            contentSchema: CONTENT_SCHEMA_VERSION,
          },
        });
        migrated += 1;
      }
    }

    if (needingSelection > 0) {
      this.logger.warn(
        `${needingSelection} LLM node(s) reference a model offered by several providers and need an explicit selection before they can run.`,
      );
    }

    return migrated;
  }

  private async migrateTemplateRevisions(
    options: TransformOptions,
  ): Promise<number> {
    let migrated = 0;

    for (;;) {
      const batch = await this.prisma.templateRevision.findMany({
        where: { contentSchema: { lt: CONTENT_SCHEMA_VERSION } },
        select: { id: true, content: true },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;

      for (const revision of batch) {
        const result = this.transform(revision.id, revision.content, options);

        // Revisions are immutable as a domain rule, but a schema conversion is not a
        // content change: the same selection is being expressed in the current shape.
        await this.prisma.templateRevision.update({
          where: { id: revision.id },
          data: {
            content: result.content,
            contentSchema: CONTENT_SCHEMA_VERSION,
          },
        });
        migrated += 1;
      }
    }

    return migrated;
  }

  private transform(id: string, content: string, options: TransformOptions) {
    try {
      return transformLlmModelRefs(content, options);
    } catch (error) {
      // Unparseable content is stamped anyway so it cannot spin the batch loop forever;
      // it is left byte-identical and reported.
      this.logger.error(
        `Could not transform content of ${id}; leaving it unchanged`,
        error,
      );
      return { content, changed: 0, needingSelection: 0 };
    }
  }
}
