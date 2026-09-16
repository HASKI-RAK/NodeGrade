import {
  Controller,
  Post,
  Body,
  Logger,
  BadRequestException,
  Res,
  Req,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LtiBasicLaunchRequest } from '@haski/lti';
import { sessionCookieOptions } from '../config/cookies.js';
import { LTI_COOKIE_NAME } from './lti-cookie.js';
import { describeLaunch } from './lti-log.js';
import { LtiService } from './lti.service.js';
import { LtiBasicLaunchValidationPipe } from './pipes/lti-validation.pipe.js';
import { LtiCookie } from '../utils/LtiCookie.js';
import { verifyLtiOAuth } from './lti-oauth.js';

@Controller('lti')
export class LtiController {
  private readonly logger = new Logger(LtiController.name);

  constructor(private readonly ltiService: LtiService) {}

  @Post('basiclogin')
  async handleBasicLogin(
    @Body(new LtiBasicLaunchValidationPipe()) payload: LtiBasicLaunchRequest,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Processing LTI basic login: ${JSON.stringify(describeLaunch(payload))}`,
      );

      const consumerSecret = process.env.LTI_CONSUMER_SECRET;
      const consumerKey = process.env.LTI_CONSUMER_KEY;
      if (consumerSecret && consumerKey) {
        const valid = verifyLtiOAuth(
          request,
          payload as unknown as Record<string, unknown>,
          consumerKey,
          consumerSecret,
        );
        if (!valid)
          throw new BadRequestException('Invalid LTI OAuth signature');
      } else {
        this.logger.warn(
          'LTI OAuth verification is disabled because credentials are unset',
        );
      }

      const launch = await this.ltiService.handleBasicLogin(payload);
      const cookie: LtiCookie = {
        user_id: payload.user_id,
        tool_consumer_instance_guid: payload.tool_consumer_instance_guid,
        isEditor:
          payload.roles.includes('Instructor') ||
          payload.roles.includes('Administrator'),
        lis_person_name_full: payload.lis_person_name_full,
        timestamp: new Date().toISOString(),
        tool_consumer_instance_name: payload.tool_consumer_instance_name,
        lis_person_contact_email_primary:
          payload.lis_person_contact_email_primary,
        issuer:
          (payload as unknown as { oauth_consumer_key?: string })
            .oauth_consumer_key ?? payload.tool_consumer_instance_guid,
        context_id: payload.context_id,
        resource_link_id: payload.resource_link_id,
        ltiKey: launch.ltiKey,
        workflowId: launch.workflowId,
      };
      response.cookie(
        LTI_COOKIE_NAME,
        JSON.stringify(cookie),
        sessionCookieOptions(5 * 60 * 60 * 1000), // 5 hours
      );
      this.logger.debug(`Set cookie ${LTI_COOKIE_NAME}`);

      const { redirectUrl } = launch;

      this.logger.debug(`Redirecting to: ${redirectUrl.split('?')[0]}`);
      response.redirect(302, redirectUrl);
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Unknown error processing LTI request';

      // Log detailed error information
      this.logger.error(
        `Error in LTI basic login: ${errorMsg}`,
        error instanceof Error ? error.stack : undefined,
      );

      // If it's a validation error, we already have details from the pipe
      if (error instanceof BadRequestException) {
        throw error;
      }

      // For other errors, provide a more descriptive error
      throw new BadRequestException(
        `Failed to process LTI request: ${errorMsg}`,
      );
    }
  }
}
