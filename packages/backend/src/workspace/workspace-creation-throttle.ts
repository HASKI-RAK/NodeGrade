import { Injectable } from '@nestjs/common';
import { positiveNumber } from '../common/env.js';
import { SlidingWindow } from '../common/sliding-window.js';

export const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
export const DEFAULT_MAX_WORKSPACES = 100;

/**
 * Caps how many workspaces one address may mint by joining workshops (escalation E3,
 * SPEC-0022/FR-015).
 *
 * The join is necessarily unauthenticated — it is where a participant's only credential
 * comes from — so without this it is an open endpoint for filling the database. The limit
 * is far above what a real participant reaches: a workshop room shares one NAT address,
 * and a facilitator may run two sessions in an hour (NFR-001).
 */
@Injectable()
export class WorkspaceCreationThrottle {
  private readonly window: SlidingWindow;

  // No constructor parameters: defaulted primitives still appear in design:paramtypes, so
  // Nest would try to resolve a `Number` provider and fail to instantiate the module.
  constructor() {
    this.window = new SlidingWindow(
      positiveNumber(process.env.WORKSPACE_CREATE_WINDOW_MS, DEFAULT_WINDOW_MS),
      positiveNumber(process.env.WORKSPACE_CREATE_MAX, DEFAULT_MAX_WORKSPACES),
    );
  }

  retryAfterMs(key: string, now: number = Date.now()): number {
    return this.window.retryAfterMs(key, now);
  }

  record(key: string, now: number = Date.now()): void {
    this.window.record(key, now);
  }
}
