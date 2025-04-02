import {
  Controller,
  Post,
  Body,
  Logger,
  HttpRedirectResponse,
} from '@nestjs/common';
import { LtiBasicLaunchRequest } from '@haski/lti';
import { LtiService } from './lti.service';
import { LtiBasicLaunchValidationPipe } from './pipes/lti-validation.pipe';

@Controller('lti')
export class LtiController {
  private readonly logger = new Logger(LtiController.name);

  constructor(private readonly ltiService: LtiService) {}

  @Post('basiclogin')
  handleBasicLogin(
    @Body(new LtiBasicLaunchValidationPipe()) payload: LtiBasicLaunchRequest,
  ): HttpRedirectResponse {
    try {
      const { redirectUrl } = this.ltiService.handleBasicLogin(payload);

      this.logger.debug(`Redirecting to: ${redirectUrl}`);
      return {
        statusCode: 302,
        url: redirectUrl,
      };
    } catch (error: unknown) {
      this.logger.error('Error in LTI basic login', error);
      throw error;
    }
  }
}
