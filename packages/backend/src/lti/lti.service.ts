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

      const timestamp = new Date().toISOString();
      const roles = payload.roles.split(',');
      const isEditor =
        roles.includes('Instructor') || roles.includes('Administrator');

      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
      const userType = isEditor ? 'editor' : 'student';
      const activityName = payload.custom_activityname || 'default';

      const redirectUrl = `${frontendUrl.trim()}/ws/${userType}/${activityName}/1/1?user_id=${payload.user_id}&timestamp=${timestamp}`;

      return {
        redirectUrl,
        isEditor,
        timestamp,
      };
    } catch (error) {
      this.logger.error('Error handling LTI basic login', error);
      throw error;
    }
  }
}
