import { Injectable, Logger } from '@nestjs/common';
import { LtiBasicLaunchRequest } from '@haski/lti';
import { describeLaunch } from './lti-log.js';
import { PrismaService } from '../prisma.service.js';
import { slugify } from '../workflow/workflow-slug.js';

type Launch = LtiBasicLaunchRequest & { oauth_consumer_key?: string };

@Injectable()
export class LtiService {
  private readonly logger = new Logger(LtiService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleBasicLogin(payload: Launch): Promise<{
    redirectUrl: string;
    isEditor: boolean;
    timestamp: string;
    ltiKey: string;
    workflowId: string;
  }> {
    try {
      this.logger.debug(
        `Basic LTI Launch Request: ${JSON.stringify(describeLaunch(payload))}`,
      );

      // Validate required fields for business logic
      if (!payload.user_id) {
        const errorMsg = 'Missing user_id in LTI payload';
        this.logger.error(errorMsg, { payload });
        throw new Error(errorMsg);
      }

      if (!payload.roles) {
        const errorMsg = 'Missing roles in LTI payload';
        this.logger.error(errorMsg, { payload });
        throw new Error(errorMsg);
      }

      const timestamp = new Date().toISOString();
      const roles = payload.roles.split(',');
      const isEditor =
        roles.includes('Instructor') || roles.includes('Administrator');

      this.logger.debug(
        `User roles: ${roles.join(', ')}, isEditor: ${isEditor}`,
      );

      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
      if (!frontendUrl) {
        const errorMsg = 'FRONTEND_URL environment variable is not set';
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Validate FRONTEND_URL format to prevent open redirect vulnerabilities
      try {
        const url = new URL(frontendUrl.trim());
        // Ensure the URL scheme is http or https
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('Invalid URL protocol');
        }
      } catch (error) {
        const errorMsg = `Invalid FRONTEND_URL: ${error instanceof Error ? error.message : 'Unknown error'}`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      const activityName = payload.custom_activityname || 'default';

      // Validate activityName to prevent path traversal attacks
      if (
        activityName.includes('..') ||
        activityName.includes('/') ||
        activityName.includes('\\')
      ) {
        const errorMsg = 'Invalid activity name: contains illegal characters';
        this.logger.error(errorMsg, { activityName });
        throw new Error(errorMsg);
      }

      const issuer =
        payload.oauth_consumer_key || payload.tool_consumer_instance_guid;
      const ltiKey = [
        issuer,
        payload.context_id,
        payload.resource_link_id,
      ].join('|');
      const workspace = await this.prisma.workspace.upsert({
        where: { ltiKey },
        update: { label: payload.context_title },
        create: {
          type: 'LTI',
          label: payload.context_title,
          ltiKey,
        },
        select: { id: true },
      });
      let workflow = await this.prisma.workflow.findFirst({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!workflow) {
        const editorPath = `/ws/editor/${activityName}/1/1`;
        const studentPath = `/ws/student/${activityName}/1/1`;
        const [editorGraph, studentGraph] = await Promise.all([
          this.prisma.legacyGraph.findUnique({ where: { path: editorPath } }),
          this.prisma.legacyGraph.findUnique({ where: { path: studentPath } }),
        ]);
        const content =
          editorGraph?.graph ??
          '{"last_node_id":0,"last_link_id":0,"nodes":[],"links":[],"groups":[],"config":{},"extra":{},"version":0.4}';
        workflow = await this.prisma.workflow.create({
          data: {
            workspaceId: workspace.id,
            slug: slugify(activityName),
            name: payload.resource_link_title || activityName,
            content,
            publishedContent: studentGraph?.graph ?? content,
            publishedVersion: 1,
            publishedAt: new Date(),
          },
          select: { id: true },
        });
      }
      const userType = isEditor ? 'editor' : 'student';
      const redirectUrl = `${frontendUrl.trim()}/${userType}/${workflow.id}?lti=1`;
      // The query string carries user_id and the person's display name, so only the
      // path is logged.
      this.logger.debug(`Generated redirect to: ${redirectUrl.split('?')[0]}`);

      return {
        redirectUrl,
        isEditor,
        timestamp,
        ltiKey,
        workflowId: workflow.id,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error handling LTI basic login: ${errorMsg}`, {
        errorMessage: errorMsg,
        payloadInfo: JSON.stringify(describeLaunch(payload)),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
