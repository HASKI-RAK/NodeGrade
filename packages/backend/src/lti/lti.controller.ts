import {
  Controller,
  Post,
  Body,
  Logger,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
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
    @Res() response: Response,
  ): void {
    try {
      this.logger.debug(
        `Processing LTI basic login with payload: ${JSON.stringify(payload)}`,
      );
      const { redirectUrl } = this.ltiService.handleBasicLogin(payload);

      this.logger.debug(`Redirecting to: ${redirectUrl}`);
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
