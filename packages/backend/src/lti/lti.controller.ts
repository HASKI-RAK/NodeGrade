import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LtiBasicLaunchRequest } from '@haski/lti';
import {
  crossSiteCookieOptions,
  sessionCookieOptions,
} from '../config/cookies.js';
import { LTI_COOKIE_NAME } from './lti-cookie.js';
import { LtiLaunchService } from './lti-launch.service.js';
import { LOGIN_STATE_TTL_MS } from './lti-login-state.store.js';
import { verifyLtiOAuth } from './lti-oauth.js';
import { ltiToolConfiguration, toolBaseUrl } from './lti-tool-config.js';
import { LtiToolKeys } from './lti-tool-keys.js';
import { LtiService, type EstablishedLaunch } from './lti.service.js';
import { LtiBasicLaunchValidationPipe } from './pipes/lti-validation.pipe.js';

export const LTI_STATE_COOKIE_NAME = 'lti_nodegrade_state';

/** The launch cookie outlives a lesson, not a day. */
const LAUNCH_COOKIE_MAX_AGE_MS = 5 * 60 * 60 * 1000;

const cookieOf = (request: Request, name: string): string | undefined =>
  (request.cookies as Record<string, string> | undefined)?.[name];

/**
 * The tool's LTI surface, outside the `api` prefix because platforms call these URLs
 * directly (SPEC-0023). Request bodies arrive as platform form posts, so they are read
 * raw and validated by hand rather than through a whitelisting DTO that would reject
 * every extra field a platform adds.
 */
@Controller('lti')
export class LtiController {
  private readonly logger = new Logger(LtiController.name);

  constructor(
    private readonly lti: LtiService,
    private readonly launches: LtiLaunchService,
    private readonly toolKeys: LtiToolKeys,
  ) {}

  /** What an admin pastes into Moodle or Canvas (FR-006). */
  @Get('config')
  config(@Req() request: Request) {
    return ltiToolConfiguration(toolBaseUrl(request));
  }

  /** The tool's public keys; empty until LTI_TOOL_PRIVATE_KEY is set (FR-007). */
  @Get('jwks')
  jwks() {
    return this.toolKeys.jwks();
  }

  /** OIDC third-party initiated login; platforms use GET or POST (FR-002). */
  @Get('login')
  loginByQuery(
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    this.login(query, request, response);
  }

  @Post('login')
  loginByForm(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    this.login(body, request, response);
  }

  /** The platform posts its id_token here (FR-003). */
  @Post('launch')
  async launch(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const launch = await this.launches.launch({
      idToken: body.id_token,
      state: body.state,
      stateCookie: cookieOf(request, LTI_STATE_COOKIE_NAME),
    });
    response.clearCookie(LTI_STATE_COOKIE_NAME, { path: '/lti' });
    this.finish(response, launch);
  }

  /**
   * The LTI 1.1 basic launch, verified with OAuth 1.0a HMAC-SHA1. 1EdTech ended
   * certification of LTI 1.1 and OAuth 1.0a in 2021 and support in 2022; it stays for
   * platforms that still have it, and every launch says so in the log.
   */
  @Post('basiclogin')
  async handleBasicLogin(
    @Body(new LtiBasicLaunchValidationPipe()) payload: LtiBasicLaunchRequest,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    this.logger.warn(
      'LTI 1.1 basic launch received; LTI 1.1 is deprecated by 1EdTech. Register this platform for LTI 1.3 (docs/lti.md).',
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
      if (!valid) {
        throw new BadRequestException({
          code: 'lti_oauth_invalid',
          message: 'Invalid LTI OAuth signature',
        });
      }
    } else {
      this.logger.warn(
        'LTI OAuth verification is disabled because LTI_CONSUMER_KEY and LTI_CONSUMER_SECRET are unset',
      );
    }

    const launch = await this.lti.handleBasicLogin(payload);
    this.finish(response, launch);
  }

  private login(raw: unknown, request: Request, response: Response): void {
    const { redirectUrl, state } = this.launches.login(
      raw,
      toolBaseUrl(request),
    );
    response.cookie(
      LTI_STATE_COOKIE_NAME,
      state,
      crossSiteCookieOptions(LOGIN_STATE_TTL_MS, '/lti'),
    );
    response.redirect(302, redirectUrl);
  }

  /** Both launch kinds end here: the same cookie, the same redirect. */
  private finish(response: Response, launch: EstablishedLaunch): void {
    response.cookie(
      LTI_COOKIE_NAME,
      JSON.stringify(launch.cookie),
      sessionCookieOptions(LAUNCH_COOKIE_MAX_AGE_MS),
    );
    // The query string carries nothing personal; the path names the workflow only.
    this.logger.debug(`Redirecting to: ${launch.redirectUrl.split('?')[0]}`);
    response.redirect(302, launch.redirectUrl);
  }
}
