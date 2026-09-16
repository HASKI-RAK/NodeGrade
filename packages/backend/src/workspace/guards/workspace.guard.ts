import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ResolvedWorkspace } from '../workspace.service.js';
import { WorkspaceService } from '../workspace.service.js';
import { parseBearerToken } from '../workspace-token.js';
import { LTI_COOKIE_NAME, parseLtiCookie } from '../../lti/lti-cookie.js';

export type RequestWithWorkspace = Request & {
  workspace?: ResolvedWorkspace;
};

/**
 * Resolves the caller's workspace from their access token (SPEC-0004/FR-004, AC-007).
 *
 * The resolved workspace is attached to the request, and route handlers read it through
 * @CurrentWorkspace(). No handler may take a workspace id from the path, query or body:
 * an id is not a credential.
 *
 * Bearer transport rather than a cookie, which is what keeps CSRF out of the whole
 * participant surface — a cross-site form post cannot set an Authorization header.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly workspaces: WorkspaceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithWorkspace>();
    const token = parseBearerToken(request.headers.authorization);
    const ltiCookie = parseLtiCookie(
      (request.cookies as Record<string, string> | undefined)?.[
        LTI_COOKIE_NAME
      ],
    );

    if (!token && !ltiCookie?.ltiKey) {
      throw new UnauthorizedException({
        code: 'workspace_token_missing',
        message: 'A workspace access token is required.',
      });
    }

    const workspace = token
      ? await this.workspaces.resolveByToken(token)
      : await this.workspaces.resolveByLtiKey(ltiCookie?.ltiKey as string);
    if (!workspace) {
      // Deliberately indistinguishable from a malformed token: whether a given token
      // ever existed is not something a caller gets to probe.
      throw new UnauthorizedException({
        code: 'workspace_token_invalid',
        message: 'The workspace access token is not valid.',
      });
    }

    request.workspace = ltiCookie
      ? { ...workspace, publishedProjection: !ltiCookie.isEditor }
      : workspace;
    return true;
  }
}
