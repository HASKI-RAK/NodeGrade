import { Injectable, Logger } from '@nestjs/common';
import { LtiBasicLaunchRequest } from '@haski/lti';

@Injectable()
export class LtiService {
  private readonly logger = new Logger(LtiService.name);

  handleBasicLogin(payload: LtiBasicLaunchRequest): {
    redirectUrl: string;
    isEditor: boolean;
    timestamp: string;
  } {
    try {
      this.logger.debug(
        `Basic LTI Launch Request with payload: ${JSON.stringify(payload)}`,
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

      const userType = isEditor ? 'editor' : 'student';
      const activityName = payload.custom_activityname || 'default';

      if (!activityName) {
        this.logger.warn('No activity name provided, using default');
      }

      const redirectUrl = `${frontendUrl.trim()}/ws/${userType}/${activityName}/1/1?user_id=${payload.user_id}&timestamp=${timestamp}`;
      this.logger.debug(`Generated redirect URL: ${redirectUrl}`);

      return {
        redirectUrl,
        isEditor,
        timestamp,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error handling LTI basic login: ${errorMsg}`, {
        errorMessage: errorMsg,
        payloadInfo: JSON.stringify(payload),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
