import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  LtiLaunchError,
  buildOidcAuthorizationUrl,
  mapLaunchClaims,
  readOidcLoginRequest,
  verifyIdToken,
  type LtiPlatformRegistration,
} from '@haski/lti';
import { JwksFetcher } from './jwks-fetcher.js';
import { LtiLoginStateStore } from './lti-login-state.store.js';
import { LtiPlatformRegistry } from './lti-platform.registry.js';
import { LtiService, type EstablishedLaunch } from './lti.service.js';

export type LtiLoginRedirect = {
  /** The platform's authorization endpoint with the authentication request. */
  redirectUrl: string;
  /** Also set as a cookie, checked when the browser brings it back. */
  state: string;
};

export type LtiLaunchRequest = {
  idToken: unknown;
  state: unknown;
  /** The state cookie as received, or undefined when the browser sent none. */
  stateCookie: string | undefined;
};

/**
 * The LTI 1.3 launch (SPEC-0023/FR-002, FR-003): the OIDC third-party initiated login
 * the platform starts, and the id_token launch it answers with.
 *
 * The tool never signs a launch. It records the login it started, redirects the
 * browser to the platform to authenticate, and then verifies the platform's token
 * against the platform's published keys and against that record.
 */
@Injectable()
export class LtiLaunchService {
  private readonly logger = new Logger(LtiLaunchService.name);

  constructor(
    private readonly platforms: LtiPlatformRegistry,
    private readonly logins: LtiLoginStateStore,
    private readonly jwks: JwksFetcher,
    private readonly lti: LtiService,
  ) {}

  /** Answers a login initiation with the authentication request (FR-002). */
  login(raw: unknown, toolBaseUrl: string): LtiLoginRedirect {
    const request = readOidcLoginRequest(raw);
    if (!request) {
      throw new BadRequestException({
        code: 'lti_login_invalid',
        message:
          'An LTI login initiation needs the platform issuer and a login hint.',
      });
    }
    const platform = this.platformFor(request.iss, request.client_id);
    if (
      request.lti_deployment_id !== undefined &&
      !platform.deploymentIds.includes(request.lti_deployment_id)
    ) {
      throw this.unknownDeployment();
    }

    const login = this.logins.issue({
      issuer: platform.issuer,
      clientId: platform.clientId,
    });
    this.logger.debug(`LTI login started for ${platform.issuer}`);
    return {
      redirectUrl: buildOidcAuthorizationUrl({
        platform,
        redirectUri: `${toolBaseUrl}/lti/launch`,
        loginHint: request.login_hint,
        ltiMessageHint: request.lti_message_hint,
        state: login.state,
        nonce: login.nonce,
      }),
      state: login.state,
    };
  }

  /** Verifies the platform's id_token and establishes the session (FR-003, FR-004). */
  async launch(request: LtiLaunchRequest): Promise<EstablishedLaunch> {
    if (
      typeof request.idToken !== 'string' ||
      typeof request.state !== 'string'
    ) {
      throw new BadRequestException({
        code: 'lti_launch_invalid',
        message: 'An LTI launch posts id_token and state.',
      });
    }
    const login = this.logins.consume(request.state);
    if (!login) {
      throw new UnauthorizedException({
        code: 'lti_state_unknown',
        message:
          'This launch answers no login this tool started, or the login expired. Start it again from the course.',
      });
    }
    if (
      request.stateCookie !== undefined &&
      request.stateCookie !== request.state
    ) {
      throw new UnauthorizedException({
        code: 'lti_state_mismatch',
        message: 'This launch was started in another browser session.',
      });
    }
    const platform = this.platformFor(login.issuer, login.clientId);
    const claims = await this.verify(request.idToken, platform, login.nonce);
    const identity = mapLaunchClaims(claims);
    if (identity.resourceLinkId === undefined) {
      throw new BadRequestException({
        code: 'lti_launch_incomplete',
        message: 'The launch names no resource link.',
      });
    }

    this.logger.debug(
      `LTI 1.3 launch from ${platform.issuer} context ${identity.contextId ?? '-'} link ${identity.resourceLinkId} as ${identity.isInstructor ? 'editor' : 'student'}`,
    );
    return this.lti.establishLaunch({
      issuer: platform.issuer,
      contextId: identity.contextId ?? '',
      contextTitle: identity.contextTitle ?? identity.resourceLinkTitle ?? '',
      resourceLinkId: identity.resourceLinkId,
      resourceLinkTitle: identity.resourceLinkTitle ?? '',
      isEditor: identity.isInstructor,
      activityName: identity.custom.activityname || 'default',
      userId: identity.userId,
      name: identity.name ?? '',
      email: identity.email ?? '',
      platformGuid: identity.platformGuid ?? platform.issuer,
      platformName: identity.platformName ?? platform.name ?? '',
    });
  }

  /**
   * Verifies against the cached key set first, and once more against a fresh one when
   * the token names a key the cache does not hold: that is what key rotation looks like.
   */
  private async verify(
    idToken: string,
    platform: LtiPlatformRegistration,
    nonce: string,
  ) {
    const keys = await this.keysOf(platform, false);
    try {
      return verifyIdToken(idToken, { platform, keys, nonce });
    } catch (error) {
      if (!(error instanceof LtiLaunchError)) throw error;
      if (error.code !== 'unknown_kid') throw this.refused(error);
      const refreshed = await this.keysOf(platform, true);
      try {
        return verifyIdToken(idToken, { platform, keys: refreshed, nonce });
      } catch (retry) {
        if (retry instanceof LtiLaunchError) throw this.refused(retry);
        throw retry;
      }
    }
  }

  private async keysOf(platform: LtiPlatformRegistration, refresh: boolean) {
    try {
      return await this.jwks.keys(platform.jwksUri, { refresh });
    } catch (error) {
      this.logger.error(
        `Could not fetch the key set of ${platform.issuer}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadGatewayException({
        code: 'lti_platform_keys_unavailable',
        message:
          'The platform key set could not be fetched. Try the launch again.',
      });
    }
  }

  private platformFor(
    issuer: string,
    clientId: string | undefined,
  ): LtiPlatformRegistration {
    const platform = this.platforms.find(issuer, clientId);
    if (platform === 'ambiguous') {
      throw new BadRequestException({
        code: 'lti_platform_ambiguous',
        message:
          'Several registrations share this issuer; the login must carry a client_id.',
      });
    }
    if (!platform) {
      throw new BadRequestException({
        code: 'lti_platform_unknown',
        message:
          'This platform is not registered with NodeGrade. Check LTI_PLATFORMS.',
      });
    }
    return platform;
  }

  private unknownDeployment(): BadRequestException {
    return new BadRequestException({
      code: 'lti_deployment_unknown',
      message:
        'This deployment is not registered with NodeGrade. Add its id to LTI_PLATFORMS.',
    });
  }

  private refused(error: LtiLaunchError): UnauthorizedException {
    this.logger.warn(`LTI launch refused: ${error.code}`);
    return new UnauthorizedException({
      code: `lti_${error.code}`,
      message: error.message,
    });
  }
}
