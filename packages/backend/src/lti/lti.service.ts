import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LtiBasicLaunchRequest, isEditorRole } from '@haski/lti';
import { describeLaunch } from './lti-log.js';
import { PrismaService } from '../prisma.service.js';
import type { LtiCookie } from '../utils/LtiCookie.js';
import { slugify } from '../workflow/workflow-slug.js';

type Launch = LtiBasicLaunchRequest & { oauth_consumer_key?: string };

const EMPTY_GRAPH =
  '{"last_node_id":0,"last_link_id":0,"nodes":[],"links":[],"groups":[],"config":{},"extra":{},"version":0.4}';

/**
 * The namespace of a 1.3 workspace key (SPEC-0004/FR-008). A 1.1 key never starts with
 * it, so the two launch kinds can never address each other's workspaces.
 */
export const LTI13_KEY_PREFIX = 'lti13:';

/** How a launch was verified; it decides the namespace of its workspace key. */
export type LaunchProtocol =
  | { version: '1.1' }
  | { version: '1.3'; clientId: string; deploymentId: string };

/** What a launch of either LTI version establishes a session from. */
export type LaunchInput = {
  protocol: LaunchProtocol;
  /** The platform: the OIDC `iss` for 1.3, the OAuth consumer key for 1.1. */
  issuer: string;
  contextId: string;
  contextTitle: string;
  resourceLinkId: string;
  resourceLinkTitle: string;
  isEditor: boolean;
  /** Legacy graph to seed a new course workspace from; `default` when unset. */
  activityName: string;
  userId: string;
  name: string;
  email: string;
  platformGuid: string;
  platformName: string;
};

export type EstablishedLaunch = {
  redirectUrl: string;
  isEditor: boolean;
  ltiKey: string;
  workflowId: string;
  /** The launch cookie the browser carries into the editor and the socket. */
  cookie: LtiCookie;
};

/**
 * The workspace key of a launch (SPEC-0004/FR-008).
 *
 * A 1.1 key is `consumer key|context|resource link`, as it always was, so existing
 * course workspaces keep resolving. A 1.3 key lives in its own namespace and names the
 * client and the deployment as well, because a resource link id is unique within a
 * deployment and nowhere wider. A 1.1 post whose consumer key or platform guid begins
 * with the 1.3 namespace is refused rather than keyed, so even an unsigned 1.1 launch
 * (LTI_11_ALLOW_UNSIGNED) cannot reach a 1.3 workspace. A platform migrated from 1.1
 * announces its old consumer key in the `lti1p1` claim; honouring that claim is how a
 * migrated course would map onto its 1.1 workspace (SPEC-0023 roadmap).
 */
export function ltiWorkspaceKey(
  input: Pick<
    LaunchInput,
    'protocol' | 'issuer' | 'contextId' | 'resourceLinkId'
  >,
): string {
  const link = [input.contextId, input.resourceLinkId];
  if (input.protocol.version === '1.3') {
    const { clientId, deploymentId } = input.protocol;
    return `${LTI13_KEY_PREFIX}${[input.issuer, clientId, deploymentId, ...link].join('|')}`;
  }
  const key = [input.issuer, ...link].join('|');
  if (key.startsWith(LTI13_KEY_PREFIX)) {
    throw new BadRequestException({
      code: 'lti_launch_invalid',
      message: 'The consumer key uses a prefix reserved for LTI 1.3 launches.',
    });
  }
  return key;
}

/**
 * Turns a verified launch into a course workspace and a workflow to open
 * (SPEC-0004/FR-008, SPEC-0023/FR-004). The 1.1 basic launch and the 1.3 launch
 * differ only in how they are verified and read; from here on they are one path.
 */
@Injectable()
export class LtiService {
  private readonly logger = new Logger(LtiService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The LTI 1.1 basic launch, already OAuth-verified by the controller. */
  async handleBasicLogin(payload: Launch): Promise<EstablishedLaunch> {
    this.logger.debug(
      `Basic LTI launch: ${JSON.stringify(describeLaunch(payload))}`,
    );
    if (!payload.user_id) throw this.invalid('Missing user_id in LTI payload');
    if (!payload.roles) throw this.invalid('Missing roles in LTI payload');

    const roles = payload.roles.split(',').map((role) => role.trim());
    return this.establishLaunch({
      protocol: { version: '1.1' },
      issuer: payload.oauth_consumer_key || payload.tool_consumer_instance_guid,
      contextId: payload.context_id,
      contextTitle: payload.context_title,
      resourceLinkId: payload.resource_link_id,
      resourceLinkTitle: payload.resource_link_title,
      isEditor: roles.some(isEditorRole),
      activityName: payload.custom_activityname || 'default',
      userId: payload.user_id,
      name: payload.lis_person_name_full,
      email: payload.lis_person_contact_email_primary,
      platformGuid: payload.tool_consumer_instance_guid,
      platformName: payload.tool_consumer_instance_name,
    });
  }

  /**
   * The shared tail of every launch: the `LTI` workspace keyed by `ltiWorkspaceKey`
   * (SPEC-0004/FR-008), its first workflow (seeded from the legacy graph named by the
   * activity, or empty), and where to send the browser.
   */
  async establishLaunch(input: LaunchInput): Promise<EstablishedLaunch> {
    const frontendUrl = this.frontendUrl();
    const activityName = this.activityName(input.activityName);

    const ltiKey = ltiWorkspaceKey(input);
    const workspace = await this.prisma.workspace.upsert({
      where: { ltiKey },
      update: { label: input.contextTitle },
      create: { type: 'LTI', label: input.contextTitle, ltiKey },
      select: { id: true },
    });

    let workflow = await this.prisma.workflow.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!workflow) {
      workflow = await this.seedWorkflow(
        workspace.id,
        activityName,
        input.resourceLinkTitle || activityName,
      );
    }

    const redirectUrl = `${frontendUrl}/${input.isEditor ? 'editor' : 'student'}/${workflow.id}?lti=1`;
    this.logger.log(
      `LTI launch into workspace ${workspace.id} (${input.isEditor ? 'editor' : 'student'}) from ${input.issuer}`,
    );

    return {
      redirectUrl,
      isEditor: input.isEditor,
      ltiKey,
      workflowId: workflow.id,
      cookie: {
        user_id: input.userId,
        timestamp: new Date().toISOString(),
        tool_consumer_instance_guid: input.platformGuid,
        isEditor: input.isEditor,
        lis_person_name_full: input.name,
        tool_consumer_instance_name: input.platformName,
        lis_person_contact_email_primary: input.email,
        issuer: input.issuer,
        context_id: input.contextId,
        resource_link_id: input.resourceLinkId,
        ltiKey,
        workflowId: workflow.id,
      },
    };
  }

  /**
   * The first workflow of a course workspace comes from the legacy graph the activity
   * names, published for students as its student variant (ADR-0004); an unknown name
   * starts empty, which an instructor then fills in the editor.
   */
  private async seedWorkflow(
    workspaceId: string,
    activityName: string,
    name: string,
  ): Promise<{ id: string }> {
    const [editorGraph, studentGraph] = await Promise.all([
      this.prisma.legacyGraph.findUnique({
        where: { path: `/ws/editor/${activityName}/1/1` },
      }),
      this.prisma.legacyGraph.findUnique({
        where: { path: `/ws/student/${activityName}/1/1` },
      }),
    ]);
    const content = editorGraph?.graph ?? EMPTY_GRAPH;
    return this.prisma.workflow.create({
      data: {
        workspaceId,
        slug: slugify(activityName),
        name,
        content,
        publishedContent: studentGraph?.graph ?? content,
        publishedVersion: 1,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
  }

  /** The launch redirects here, so it has to be a URL and not an open redirect. */
  private frontendUrl(): string {
    const raw = (process.env.FRONTEND_URL ?? 'http://localhost:5173').trim();
    try {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid URL protocol');
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Invalid FRONTEND_URL: ${reason}`);
      throw new Error(`Invalid FRONTEND_URL: ${reason}`);
    }
    return raw;
  }

  /** The activity name becomes a legacy graph path, so it must not traverse one. */
  private activityName(raw: string): string {
    if (raw.includes('..') || raw.includes('/') || raw.includes('\\')) {
      throw this.invalid('Invalid activity name: contains illegal characters');
    }
    return raw;
  }

  private invalid(message: string): BadRequestException {
    return new BadRequestException({ code: 'lti_launch_invalid', message });
  }
}
