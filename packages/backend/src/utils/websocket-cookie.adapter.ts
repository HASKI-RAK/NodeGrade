import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions, Socket } from 'socket.io';
import {
  LTI_COOKIE_NAME,
  parseCookieHeader,
  parseLtiCookie,
} from '../lti/lti-cookie.js';
import { WorkspaceService } from '../workspace/workspace.service.js';
import type { ResolvedWorkspace } from '../workspace/workspace.service.js';

export class WebSocketCookieAdapter extends IoAdapter {
  // Named to avoid colliding with the `logger` property introduced in the base IoAdapter
  private readonly adapterLogger = new Logger(WebSocketCookieAdapter.name);

  constructor(private readonly application: INestApplicationContext) {
    super(application);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, options);

    // Add middleware to parse cookies and attach them to the socket handshake
    // Socket.IO middleware supports an async body through its callback completion.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    server.use(async (socket: Socket, next) => {
      try {
        const cookies = parseCookieHeader(socket.handshake.headers.cookie);
        socket.handshake.auth.parsedCookies = cookies;

        const raw = cookies[LTI_COOKIE_NAME];
        const ltiCookie = parseLtiCookie(raw);

        if (ltiCookie) {
          socket.handshake.auth.ltiCookie = ltiCookie;
          this.adapterLogger.debug(
            `LTI cookie parsed for socket: ${ltiCookie.user_id}`,
          );
        } else if (raw) {
          this.adapterLogger.warn('Invalid LTI cookie structure');
        }
        const workspaces = this.application.get(WorkspaceService);
        const presentedToken =
          typeof socket.handshake.auth.workspaceToken === 'string'
            ? socket.handshake.auth.workspaceToken
            : undefined;
        const workspace = presentedToken
          ? await workspaces.resolveByToken(presentedToken)
          : ltiCookie?.ltiKey
            ? await workspaces.resolveByLtiKey(ltiCookie.ltiKey)
            : null;
        if (workspace) {
          (socket.data as { workspace?: ResolvedWorkspace }).workspace =
            workspace;
        } else if (presentedToken || ltiCookie?.ltiKey) {
          next(new Error('Workspace authentication failed'));
          return;
        } else if (ltiCookie) {
          this.adapterLogger.warn('Legacy LTI cookie has no workspace key');
        }
      } catch (error) {
        this.adapterLogger.error('Error in WebSocket middleware:', error);
        next(new Error('Workspace authentication failed'));
        return;
      }

      // An absent or malformed cookie means an unauthenticated visitor, not a rejected
      // connection: the editor connects before any identity has been established.
      next();
    });

    return server;
  }
}
