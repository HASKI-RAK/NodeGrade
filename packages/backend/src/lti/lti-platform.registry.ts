import type { LtiPlatformRegistration } from '@haski/lti';
import { parseLtiPlatforms } from '../config/lti-platforms.js';

/**
 * The platforms allowed to launch this tool over LTI 1.3 (SPEC-0023/FR-001).
 *
 * Held in memory from LTI_PLATFORMS: a registration changes when an institution
 * re-registers the tool, which is a deployment event, not a runtime one. Registered
 * through a factory because Nest cannot inject a plain array.
 */
export class LtiPlatformRegistry {
  constructor(private readonly platforms: LtiPlatformRegistration[]) {}

  static fromEnvironment(): LtiPlatformRegistry {
    return new LtiPlatformRegistry(
      parseLtiPlatforms(process.env.LTI_PLATFORMS),
    );
  }

  get size(): number {
    return this.platforms.length;
  }

  /**
   * The registration a login or launch belongs to. A client id is optional on a login
   * initiation, so an issuer with exactly one registration resolves without it; an
   * issuer that hosts several client ids (Canvas) needs the id to be unambiguous.
   */
  find(
    issuer: string,
    clientId?: string,
  ): LtiPlatformRegistration | 'ambiguous' | undefined {
    const candidates = this.platforms.filter(
      (platform) => platform.issuer === issuer,
    );
    if (clientId !== undefined) {
      return candidates.find((platform) => platform.clientId === clientId);
    }
    if (candidates.length > 1) return 'ambiguous';
    return candidates[0];
  }
}
