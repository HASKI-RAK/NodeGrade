import { getNodeDefinition } from '@haski/ta-lib';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { ProviderRuntimeService } from '../provider/provider-runtime.service.js';
import {
  graphNodeTypes,
  parseGraphContent,
  TemplateContentError,
} from '../template/template-content.js';
import { WorkshopService } from './workshop.service.js';

export type ReadinessCheckId = 'backend' | 'template' | 'node_types' | 'models';

export type ReadinessCheck = {
  id: ReadinessCheckId;
  label: string;
  status: 'PASS' | 'FAIL';
  detail: string;
};

export type WorkshopReadiness = {
  status: 'PASS' | 'FAIL';
  checks: ReadinessCheck[];
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

const workshopSelect = {
  id: true,
  status: true,
  template: { select: { published: true, deletedAt: true } },
  templateRevision: { select: { id: true, name: true, content: true } },
} as const;

type WorkshopRow = {
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  template: { published: boolean; deletedAt: Date | null };
  templateRevision: { id: string; name: string; content: string } | null;
};

/**
 * The preflight behind workshop entry and the facilitator readiness view
 * (SPEC-0007/FR-009, FR-010).
 *
 * Every check answers one question a facilitator would otherwise only get answered by a
 * room full of participants failing at once: is the server up, does the workshop still
 * have content, can this build load that content, and is there a model anyone is allowed
 * to run. They are reported together rather than as a single boolean so a failure names
 * what to fix.
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
    return this.evaluate(workshop);
  }

  private async evaluate(workshop: WorkshopRow): Promise<WorkshopReadiness> {
    const checks: ReadinessCheck[] = [
      pass('backend', 'Backend', 'The backend answered this request.'),
      this.templateCheck(workshop),
    ];
    checks.push(this.nodeTypeCheck(workshop.templateRevision?.content));
    checks.push(await this.modelCheck());

    return {
      status: checks.some((check) => check.status === 'FAIL') ? 'FAIL' : 'PASS',
      checks,
    };
  }

  private templateCheck(workshop: WorkshopRow): ReadinessCheck {
    const label = 'Workshop template';
    if (!workshop.templateRevision)
      return fail(
        'template',
        label,
        'The workshop has no template revision to hand out.',
      );
    if (workshop.template.deletedAt !== null)
      return fail('template', label, 'The template has been deleted.');
    if (!workshop.template.published)
      return fail('template', label, 'The template is not published.');
    return pass(
      'template',
      label,
      `Handing out “${workshop.templateRevision.name}”.`,
    );
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
        (type) => getNodeDefinition(type) === undefined,
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
   * offering at least one model its policy permits (SPEC-0010, SPEC-0012).
   */
  private async modelCheck(): Promise<ReadinessCheck> {
    const label = 'Provider and models';
    const catalog = await this.runtime.catalog();
    const reachable = catalog.providers.filter(
      (provider) => provider.status === 'AVAILABLE',
    );
    if (catalog.models.length > 0 && reachable.length > 0)
      return pass(
        'models',
        label,
        `${catalog.models.length} model(s) available from ${reachable
          .map((provider) => provider.providerName)
          .join(', ')}.`,
      );
    if (catalog.providers.length === 0)
      return fail('models', label, 'No provider is configured and enabled.');
    const statuses = catalog.providers
      .map((provider) => `${provider.providerName}: ${provider.status}`)
      .join(', ');
    return fail(
      'models',
      label,
      reachable.length === 0
        ? `No provider is reachable (${statuses}).`
        : `No model is allowed for participants (${statuses}).`,
    );
  }

  private unavailable(): NotFoundException {
    return new NotFoundException({
      code: 'workshop_unavailable',
      message: 'This workshop is unavailable.',
    });
  }
}
