import { ClientEventPayload } from '@haski/ta-lib';
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { resolveCorsOrigins } from '../config/cors.js';
import { GraphHandlerService } from './graph-handler.service.js';

// Evaluated while the decorator below is applied, so this reads the environment directly
// rather than going through dependency injection.
const allowedSocketOrigins = resolveCorsOrigins();

@WebSocketGateway({
  cors: {
    origin: allowedSocketOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Origin',
      'X-Requested-With',
      'Accept',
    ],
  },
  path: '/socket.io',
})
export class GraphGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(GraphGateway.name);
  @WebSocketServer()
  io: Server;

  constructor(private readonly graphHandlerService: GraphHandlerService) {}

  afterInit() {
    this.logger.log('Initialized');
  }

  handleConnection(client: Socket) {
    const { sockets } = this.io.sockets;
    this.logger.log(`Client id: ${client.id} connected`);
    this.logger.debug(`Number of connected clients: ${sockets.size}`);

    // LTI cookie is now handled by our WebSocketCookieAdapter
    if (client.handshake.auth.ltiCookie) {
      this.logger.debug(
        `Client ${client.id} connected with LTI cookie for user: ${client.handshake.auth.ltiCookie}`,
      );
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client id:${client.id} disconnected`);
    this.graphHandlerService.cancelRunsForClient(client.id);
  }

  @SubscribeMessage('runGraph')
  async handleRunGraph(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ClientEventPayload['runGraph'],
  ) {
    await this.graphHandlerService.handleRunGraph(client, payload);
  }

  @SubscribeMessage('cancelRun')
  handleCancelRun(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ClientEventPayload['cancelRun'],
  ) {
    this.graphHandlerService.cancelRun(client, payload);
  }
}
