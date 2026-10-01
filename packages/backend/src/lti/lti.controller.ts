import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { LtiBasicLaunchRequest } from '@haski/lti';
import {
  crossSiteCookieOptions,
  sessionCookieOptions,
} from '../config/cookies.js';
import { LTI_COOKIE_NAME, ltiStateCookieName } from './lti-cookie.js';
import { LtiLaunchService } from './lti-launch.service.js';
import { LOGIN_STATE_TTL_MS } from './lti-login-state.store.js';
import { LtiLoginThrottle } from './lti-login-throttle.js';
import { unsignedBasicLaunchAllowed, verifyLtiOAuth } from './lti-oauth.js';
import {
  canvasToolConfiguration,
  ltiToolConfiguration,
  toolBaseUrl,
} from './lti-tool-config.js';
import { LtiToolKeys } from './lti-tool-keys.js';
import { LtiService, type EstablishedLaunch } from './lti.service.js';
import { LtiBasicLaunchValidationPipe } from './pipes/lti-validation.pipe.js';

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
    private readonly loginThrottle: LtiLoginThrottle,
  ) {}

  /**
   * What an admin copies into Moodle or Canvas (FR-006); `?format=canvas` answers the
   * JSON that Canvas's "Paste JSON" developer key form imports.
   */
  @Get('config')
  config(@Req() request: Request, @Query('format') format?: string) {
    const baseUrl = toolBaseUrl(request);
    return format === 'canvas'
      ? canvasToolConfiguration(baseUrl)
      : ltiToolConfiguration(baseUrl);
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
    const cookieName =
      typeof body.state === 'string'
        ? ltiStateCookieName(body.state)
        : undefined;
    const launch = await this.launches.launch({
      idToken: body.id_token,
      state: body.state,
      stateCookie:
        cookieName === undefined ? undefined : cookieOf(request, cookieName),
    });
    // The login is answered, so its cookie has nothing left to bind.
    if (cookieName !== undefined) {
      response.clearCookie(cookieName, this.stateCookieOptions());
    }
    this.finish(response, launch);
  }

  /**
   * The LTI 1.1 basic launch, verified with OAuth 1.0a HMAC-SHA1 (FR-005). 1EdTech ended
   * certification of LTI 1.1 and OAuth 1.0a in 2021 and support in 2022; it stays for
   * platforms that still have it, and every launch says so in the log.
   *
   * Without the consumer credentials the launch is refused: an unverified form post
   * would let anyone pick a course workspace and the editor role. LTI_11_ALLOW_UNSIGNED
   * reopens it for local testing against a platform without a secret.
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
    } else if (unsignedBasicLaunchAllowed()) {
      this.logger.warn(
        'LTI 1.1 launch accepted without a signature because LTI_11_ALLOW_UNSIGNED is set. Local testing only: set LTI_CONSUMER_KEY and LTI_CONSUMER_SECRET for a deployment.',
      );
    } else {
      throw new ServiceUnavailableException({
        code: 'lti_11_not_configured',
        message:
          'The LTI 1.1 launch is not configured on this deployment: LTI_CONSUMER_KEY and LTI_CONSUMER_SECRET are unset.',
      });
    }

    const launch = await this.lti.handleBasicLogin(payload);
    this.finish(response, launch);
  }

  private login(raw: unknown, request: Request, response: Response): void {
    this.throttleLogin(request, response);
    const { redirectUrl, state } = this.launches.login(
      raw,
      toolBaseUrl(request),
    );
    response.cookie(
      ltiStateCookieName(state),
      state,
      this.stateCookieOptions(),
    );
    response.redirect(302, redirectUrl);
  }

  /** The same 429 and Retry-After as the other throttled routes (FR-002). */
  private throttleLogin(request: Request, response: Response): void {
    const key = request.ip ?? 'unknown';
    const retryAfterMs = this.loginThrottle.retryAfterMs(key);
    if (retryAfterMs > 0) {
      const retryAfter = Math.ceil(retryAfterMs / 1000);
      response.setHeader('Retry-After', String(retryAfter));
      // @nestjs/common has no TooManyRequestsException.
      throw new HttpException(
        {
          code: 'too_many_requests',
          message: `Too many LTI logins from this address. Try again in ${retryAfter} seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.loginThrottle.record(key);
  }

  /**
   * The state cookie travels with the platform's cross-site form post, so it is
   * SameSite=None (Secure) and lives only as long as the login it binds. Clearing a
   * cookie needs the same attributes, which is why both calls share them.
   */
  private stateCookieOptions(): CookieOptions {
    return crossSiteCookieOptions(LOGIN_STATE_TTL_MS, '/lti');
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
