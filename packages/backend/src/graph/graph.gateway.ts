import { WebSocket } from 'ws';
import { ClientEventPayload } from '@haski/ta-lib';
import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { GraphHandlerService } from './graph-handler.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
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

  handleConnection(client: any, ...args: any[]) {
    const { sockets } = this.io.sockets;

    this.logger.log(`Client id: ${client.id} connected`);
    this.logger.debug(`Number of connected clients: ${sockets.size}`);
  }

  handleDisconnect(client: any) {
    this.logger.log(`Client id:${client.id} disconnected`);
  }

  @SubscribeMessage('runGraph')
  async handleRunGraph(client: any, payload: ClientEventPayload['runGraph']) {
    await this.graphHandlerService.handleRunGraph(client, payload);
  }

  @SubscribeMessage('saveGraph')
  async handleSaveGraph(client: any, payload: ClientEventPayload['saveGraph']) {
    await this.graphHandlerService.handleSaveGraph(client, payload);
  }
}
