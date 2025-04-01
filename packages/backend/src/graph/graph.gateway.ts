import { WebSocket } from 'ws';
import {
  AnswerInputNode,
  ClientEventPayload,
  LGraph,
  OutputNode,
  SerializedGraph,
} from '@haski/ta-lib';
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
    this.logger.log(`RunGraph event received from client id: ${client.id}`);
    const lgraph = new LGraph();
    lgraph.configure(payload.graph);

    lgraph
      .findNodesByClass<AnswerInputNode>(AnswerInputNode)
      .forEach((node) => {
        node.properties.value = payload.answer.substring(0, 700);
      });

    try {
      await runLgraph(lgraph, (percentage) => {
        client.emit('processingPercentageUpdate', {
          eventName: 'processingPercentageUpdate',
          payload: Number(percentage.toFixed(2)) * 100,
        });
      });

      const resultNodes = lgraph.findNodesByClass<OutputNode>(OutputNode);
      const outputs = resultNodes.map((node) => node.properties);

      client.emit('graphFinished', {
        eventName: 'graphFinished',
        payload: lgraph.serialize<SerializedGraph>(),
      });
    } catch (error) {
      this.logger.error('Error running graph: ', error);
    }
  }

  @SubscribeMessage('saveGraph')
  async handleSaveGraph(client: any, payload: ClientEventPayload['saveGraph']) {
    this.logger.log(`SaveGraph event received from client id: ${client.id}`);
    const lgraph = new LGraph();
    lgraph.configure(payload.graph);

    const name = payload.name || 'UnnamedGraph';
    this.logger.debug(`Saving graph with name: ${name}`);

    try {
      await prismaGraphCreateOrUpdate(prisma, name, lgraph);
      client.emit('graphSaved', {
        eventName: 'graphSaved',
        payload: lgraph.serialize<SerializedGraph>(),
      });

      sendQuestion(lgraph, client);
    } catch (error) {
      this.logger.error('Error saving graph: ', error);
    }
  }
}
