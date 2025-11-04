import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions, Socket } from 'socket.io';
import { LtiCookie } from './LtiCookie';
import { Logger } from '@nestjs/common';

export class WebSocketCookieAdapter extends IoAdapter {
  private readonly logger = new Logger(WebSocketCookieAdapter.name);

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, options) as Server;

    // Add middleware to parse cookies and attach them to the socket handshake
    server.use((socket: Socket, next) => {
      try {
        const cookies = socket.handshake.headers.cookie;
        if (cookies) {
          const parsedCookies = this.parseCookies(cookies);
          socket.handshake.auth.parsedCookies = parsedCookies;

          // Parse the LTI cookie if it exists
          const ltiCookieStr = parsedCookies['lti_nodegrade_cookie'];
          if (ltiCookieStr) {
            try {
              const decodedCookie = decodeURIComponent(ltiCookieStr);

              // Validate the decoded cookie is not too large (prevent DoS attacks)
              if (decodedCookie.length > 10000) {
                this.logger.warn('LTI cookie too large, rejecting');
                next();
                return;
              }

              // Parse JSON without premature type casting
              const parsedCookie = JSON.parse(decodedCookie) as unknown;

              // Validate the parsed cookie has all required fields
              if (
                typeof parsedCookie === 'object' &&
                parsedCookie !== null &&
                typeof (parsedCookie as LtiCookie).user_id === 'string' &&
                typeof (parsedCookie as LtiCookie).timestamp === 'string' &&
                typeof (parsedCookie as LtiCookie)
                  .tool_consumer_instance_guid === 'string' &&
                typeof (parsedCookie as LtiCookie).isEditor === 'boolean' &&
                typeof (parsedCookie as LtiCookie).lis_person_name_full ===
                  'string' &&
                typeof (parsedCookie as LtiCookie)
                  .tool_consumer_instance_name === 'string' &&
                typeof (parsedCookie as LtiCookie)
                  .lis_person_contact_email_primary === 'string'
              ) {
                const ltiCookie = parsedCookie as LtiCookie;
                socket.handshake.auth.ltiCookie = ltiCookie;
                this.logger.debug(
                  `LTI cookie parsed for socket: ${ltiCookie.user_id}`,
                );
              } else {
                this.logger.warn('Invalid LTI cookie structure');
              }
            } catch (error) {
              this.logger.error('Error parsing LTI cookie:', error);
            }
          }
        }
        next();
      } catch (error) {
        this.logger.error('Error in WebSocket middleware:', error);
        next();
      }
    });

    return server;
  }

  private parseCookies(cookieString: string): { [key: string]: string } {
    const cookies: { [key: string]: string } = {};
    if (!cookieString) return cookies;
    cookieString.split(';').forEach((cookie) => {
      const parts = cookie.trim().split('=');
      if (parts.length === 2) {
        cookies[parts[0]] = parts[1];
      }
    });
    return cookies;
  }
}
