import { Injectable } from '@nestjs/common';
import { positiveNumber } from '../common/env.js';
import { SlidingWindow } from '../common/sliding-window.js';

export const DEFAULT_WINDOW_MS = 60 * 1000;
export const DEFAULT_MAX_LOGINS = 60;

/**
 * Caps login initiations per address (SPEC-0023/FR-002).
 *
 * `/lti/login` is unauthenticated by design, since the platform has not spoken yet, and
 * every call records a pending login for ten minutes. Without a cap one address could
 * fill the login store, evicting the logins of people mid-launch, and use the tool as a
 * redirect generator. The limit is far above what a course produces: a launch is one
 * login, and a lecture hall behind one NAT address starts a few dozen a minute.
 */
@Injectable()
export class LtiLoginThrottle {
  private readonly window: SlidingWindow;

  // No constructor parameters: defaulted primitives still appear in design:paramtypes, so
  // Nest would try to resolve a `Number` provider and fail to instantiate the module.
  constructor() {
    this.window = new SlidingWindow(
      positiveNumber(process.env.LTI_LOGIN_WINDOW_MS, DEFAULT_WINDOW_MS),
      positiveNumber(process.env.LTI_LOGIN_MAX, DEFAULT_MAX_LOGINS),
    );
  }

  /** Milliseconds until the caller may start another login, or 0 when it may now. */
  retryAfterMs(key: string, now: number = Date.now()): number {
    return this.window.retryAfterMs(key, now);
  }

  record(key: string, now: number = Date.now()): void {
    this.window.record(key, now);
  }
}
