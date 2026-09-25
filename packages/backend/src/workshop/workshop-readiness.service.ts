import {
  getNodeDefinition,
  isModelRef,
  type ModelCatalog,
} from '@haski/ta-lib';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { ProviderRuntimeService } from '../provider/provider-runtime.service.js';
import {
  graphModelNodes,
  graphNodeTypes,
  parseGraphContent,
  TemplateContentError,
} from '../template/template-content.js';
import { ENTRY_SELECT, type EntryRow } from './workshop-entries.js';
import { WorkshopService } from './workshop.service.js';

export type ReadinessCheckId =
  'backend' | 'templates' | 'template' | 'node_types' | 'models';

export type ReadinessCheck = {
  id: ReadinessCheckId;
  label: string;
  status: 'PASS' | 'FAIL';
  detail: string;
};

/** The checks for one workshop entry (SPEC-0022/FR-016). */
export type EntryReadiness = {
  entryId: string;
  templateName: string;
  status: 'PASS' | 'FAIL';
  checks: ReadinessCheck[];
};

/**
 * `checks` holds the workshop-level verdicts — the backend and whether any entry is
 * ready — so a client that predates entries still reads a meaningful list; `entries`
 * breaks the template checks down per entry.
 */
export type WorkshopReadiness = {
  status: 'PASS' | 'FAIL';
  checks: ReadinessCheck[];
  entries: EntryReadiness[];
};

const pass = (
  id: ReadinessCheckId,
  label: string,
  detail: string,
): ReadinessCheck => ({ id, label, status: 'PASS', detail });

const fail = (
  id: ReadinessCheckId,
  label: string,
  detail: string,
): ReadinessCheck => ({ id, label, status: 'FAIL', detail });

const statusOf = (checks: ReadinessCheck[]): 'PASS' | 'FAIL' =>
  checks.some((check) => check.status === 'FAIL') ? 'FAIL' : 'PASS';

const workshopSelect = {
  id: true,
  templates: { select: ENTRY_SELECT, orderBy: { position: 'asc' } },
} as const;

/**
 * The preflight behind workshop entry and the facilitator readiness view
 * (SPEC-0007/FR-009, FR-010; SPEC-0022/FR-016).
 *
 * Every check answers one question a facilitator would otherwise only get answered by a
 * room full of participants failing at once: is the server up, does each workshop entry
 * still have content, can this build load that content, and is there a model anyone is
 * allowed to run. They are reported together rather than as a single boolean so a failure
 * names what to fix. One broken entry does not fail the workshop: participants can still
 * start the others, and see the broken one as unavailable.
 */
@Injectable()
export class WorkshopReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: ProviderRuntimeService,
    private readonly workshops: WorkshopService,
  ) {}

  /**
   * Participant entry. A code that is closed, expired or unknown is not a failing check
   * but an unavailable workshop, so it keeps raising the same 404 the join does.
   */
  async byCode(code: string): Promise<WorkshopReadiness> {
    const workshop = await this.workshops.resolve(code);
    return this.byId(workshop.id);
  }

  async byId(id: string): Promise<WorkshopReadiness> {
    const workshop = await this.prisma.workshop.findUnique({
      where: { id },
      select: workshopSelect,
    });
    if (!workshop) throw this.unavailable();
    return this.evaluate(workshop.templates);
  }

  /** Readiness of each entry, for callers that only need per-entry availability. */
  async entries(entries: EntryRow[]): Promise<EntryReadiness[]> {
    const catalog = await this.runtime.catalog();
    return Promise.all(entries.map((entry) => this.entry(entry, catalog)));
  }

  private async evaluate(rows: EntryRow[]): Promise<WorkshopReadiness> {
    const entries = await this.entries(rows);
    const ready = entries.filter((entry) => entry.status === 'PASS');
    const label = 'Workshop templates';
    const templates =
      entries.length === 0
        ? fail('templates', label, 'The workshop offers no template.')
        : ready.length === 0
          ? fail(
              'templates',
              label,
              `No template is ready: ${entries
                .map(
                  (entry) =>
                    `${entry.templateName} (${entry.checks
                      .filter((check) => check.status === 'FAIL')
                      .map((check) => check.detail)
                      .join(' ')})`,
                )
                .join('; ')}`,
            )
          : pass(
              'templates',
              label,
              `${ready.length} of ${entries.length} template(s) ready.`,
            );
    const checks = [
      pass('backend', 'Backend', 'The backend answered this request.'),
      templates,
    ];
    return { status: statusOf(checks), checks, entries };
  }

  private async entry(
    entry: EntryRow,
    catalog: ModelCatalog,
  ): Promise<EntryReadiness> {
    const resolution = await this.workshops.resolveEntryRevision(entry);
    const label = 'Template';
    const content = resolution.ok ? resolution.revision.content : undefined;
    const checks = [
      resolution.ok
        ? pass(
            'template',
            label,
            `Handing out “${resolution.revision.name}” (r${resolution.revision.revision}).`,
          )
        : fail('template', label, resolution.reason),
      this.nodeTypeCheck(content),
      this.modelCheck(content, catalog),
    ];
    return {
      entryId: entry.id,
      templateName: entry.template.name,
      status: statusOf(checks),
      checks,
    };
  }

  /**
   * LGraph.configure() drops node types it does not know instead of failing, so an
   * unregistered type reaches a participant as a workflow with pieces missing.
   */
  private nodeTypeCheck(content: string | undefined): ReadinessCheck {
    const label = 'Node types';
    if (content === undefined)
      return fail(
        'node_types',
        label,
        'There is no template content to check.',
      );
    try {
      const missing = graphNodeTypes(parseGraphContent(content)).filter(
        (type) =>
          type !== 'graph/subgraph' && getNodeDefinition(type) === undefined,
      );
      return missing.length === 0
        ? pass(
            'node_types',
            label,
            'Every node type the template uses is registered.',
          )
        : fail(
            'node_types',
            label,
            `This build does not register: ${missing.join(', ')}.`,
          );
    } catch (error) {
      return fail(
        'node_types',
        label,
        error instanceof TemplateContentError
          ? error.message
          : 'The template content could not be read.',
      );
    }
  }

  /**
   * Passes only when a participant could actually run something: a reachable provider
   * offering at least one model its policy permits (SPEC-0010, SPEC-0012). Model nodes
   * without an explicit selection pass when the facilitator's deployment default is
   * available, since execution substitutes it at run time (SPEC-0016).
   */
  private modelCheck(
    content: string | undefined,
    catalog: ModelCatalog,
  ): ReadinessCheck {
    const label = 'Provider and models';
    if (content === undefined)
      return fail('models', label, 'There is no template content to check.');

    let modelRefs: { providerKey: string; modelId: string }[];
    let defaultedCount = 0;
    try {
      const modelNodes = graphModelNodes(parseGraphContent(content));
      const invalid = modelNodes.filter((node) => {
        const properties = node.properties;
        if (typeof properties !== 'object' || properties === null) return true;
        return (
          !isModelRef(Reflect.get(properties, 'model_ref')) ||
          Reflect.get(properties, 'needs_model_selection') === true
        );
      });
      const configured = modelNodes.filter((node) => !invalid.includes(node));
      modelRefs = configured.map((node) => {
        const properties = node.properties as Record<string, unknown>;
        return properties.model_ref as { providerKey: string; modelId: string };
      });
      if (invalid.length > 0) {
        const fallback = catalog.defaultModel;
        const fallbackAvailable =
          fallback !== null &&
          catalog.models.some(
            (model) =>
              model.ref.providerKey === fallback.providerKey &&
              model.ref.modelId === fallback.modelId,
          );
        if (!fallbackAvailable)
          return fail(
            'models',
            label,
            `${invalid.length} model node(s) need a configured provider and model.`,
          );
        defaultedCount = invalid.length;
      }
    } catch (error) {
      return fail(
        'models',
        label,
        error instanceof TemplateContentError
          ? error.message
          : 'The template model configuration could not be read.',
      );
    }

    const reachable = catalog.providers.filter(
      (provider) => provider.status === 'AVAILABLE',
    );
    if (catalog.providers.length === 0)
      return fail('models', label, 'No provider is configured and enabled.');
    const statuses = catalog.providers
      .map((provider) => `${provider.providerName}: ${provider.status}`)
      .join(', ');
    if (reachable.length === 0)
      return fail('models', label, `No provider is reachable (${statuses}).`);
    if (catalog.models.length === 0)
      return fail(
        'models',
        label,
        `No model is allowed for participants (${statuses}).`,
      );
    const unavailable = modelRefs.filter(
      (ref) =>
        !catalog.models.some(
          (model) =>
            model.ref.providerKey === ref.providerKey &&
            model.ref.modelId === ref.modelId,
        ),
    );
    if (unavailable.length > 0)
      return fail(
        'models',
        label,
        `Template model unavailable: ${[
          ...new Set(
            unavailable.map((ref) => `${ref.providerKey}/${ref.modelId}`),
          ),
        ].join(', ')}.`,
      );
    const fallback = catalog.defaultModel;
    if (defaultedCount > 0 && fallback !== null)
      return pass(
        'models',
        label,
        `${defaultedCount} model node(s) will use the default model ` +
          `(${fallback.providerKey}/${fallback.modelId}).`,
      );
    if (modelRefs.length > 0)
      return pass(
        'models',
        label,
        `Every configured model is available (${[
          ...new Set(
            modelRefs.map((ref) => `${ref.providerKey}/${ref.modelId}`),
          ),
        ].join(', ')}).`,
      );

    return pass(
      'models',
      label,
      `${catalog.models.length} model(s) available from ${reachable
        .map((provider) => provider.providerName)
        .join(', ')}.`,
    );
  }

  private unavailable(): NotFoundException {
    return new NotFoundException({
      code: 'workshop_unavailable',
      message: 'This workshop is unavailable.',
    });
  }
}
