import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/** How long a platform has to answer the authentication request with its id_token. */
export const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;

/** Bounds memory under a flood of login initiations that never complete. */
const MAX_PENDING_LOGINS = 10_000;

export type LtiLoginState = {
  state: string;
  nonce: string;
  issuer: string;
  clientId: string;
  createdAt: number;
};

/**
 * The logins this tool has started and not yet seen a launch for (SPEC-0023/FR-002).
 *
 * Server-side rather than a cookie alone: the launch is a cross-site form post from the
 * platform, which a SameSite=Lax cookie does not accompany, and third-party cookies in
 * an LMS iframe are blocked outright by some browsers. The record is consumed on first
 * use, so a replayed launch finds nothing to answer and its nonce cannot be used twice.
 *
 * In memory on purpose, like the throttles: a login and its launch are seconds apart
 * and reach the same process.
 */
@Injectable()
export class LtiLoginStateStore {
  private readonly pending = new Map<string, LtiLoginState>();

  issue(
    login: { issuer: string; clientId: string },
    now: number = Date.now(),
  ): LtiLoginState {
    this.evict(now);
    const record: LtiLoginState = {
      state: randomBytes(32).toString('base64url'),
      nonce: randomBytes(32).toString('base64url'),
      issuer: login.issuer,
      clientId: login.clientId,
      createdAt: now,
    };
    this.pending.set(record.state, record);
    return record;
  }

  /** Returns the record once and never again; null when unknown or expired. */
  consume(state: string, now: number = Date.now()): LtiLoginState | null {
    const record = this.pending.get(state);
    if (!record) return null;
    this.pending.delete(state);
    return now - record.createdAt < LOGIN_STATE_TTL_MS ? record : null;
  }

  get size(): number {
    return this.pending.size;
  }

  private evict(now: number): void {
    for (const [state, record] of this.pending) {
      if (now - record.createdAt >= LOGIN_STATE_TTL_MS)
        this.pending.delete(state);
    }
    // Map iteration is insertion-ordered, so the first key is the oldest login.
    while (this.pending.size >= MAX_PENDING_LOGINS) {
      const oldest = this.pending.keys().next();
      if (oldest.done) break;
      this.pending.delete(oldest.value);
    }
  }
}
