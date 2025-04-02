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

  handleConnection(client: Socket) {
    const { sockets } = this.io.sockets;

    this.logger.log(`Client id: ${client.id} connected`);
    this.logger.debug(`Number of connected clients: ${sockets.size}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client id:${client.id} disconnected`);
  }

  @SubscribeMessage('runGraph')
  async handleRunGraph(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ClientEventPayload['runGraph'],
  ) {
    await this.graphHandlerService.handleRunGraph(client, payload);
  }

  @SubscribeMessage('saveGraph')
  async handleSaveGraph(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ClientEventPayload['saveGraph'],
  ) {
    await this.graphHandlerService.handleSaveGraph(client, payload);
  }

  @SubscribeMessage('loadGraph')
  async handleLoadGraph(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ClientEventPayload['loadGraph'],
  ) {
    await this.graphHandlerService.handleLoadGraph(client, payload);
  }
}
