import { Injectable, Logger } from '@nestjs/common';
import {
  ClientEventPayload,
  LGraph,
  SerializedGraph,
  AnswerInputNode,
  OutputNode,
} from '@haski/ta-lib';
import { GraphService } from 'src/graph.service';

@Injectable()
export class GraphHandlerService {
  private readonly logger = new Logger(GraphHandlerService.name);

  constructor(private readonly graphService: GraphService) {}

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
      await this.graphService.runLgraph(lgraph, (percentage) => {
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

  async handleSaveGraph(client: any, payload: ClientEventPayload['saveGraph']) {
    this.logger.log(`SaveGraph event received from client id: ${client.id}`);
    const lgraph = new LGraph();
    lgraph.configure(payload.graph);

    const name = payload.name || 'UnnamedGraph';
    this.logger.debug(`Saving graph with name: ${name}`);

    try {
      await this.graphService.saveGraph(name, lgraph);
      client.emit('graphSaved', {
        eventName: 'graphSaved',
        payload: lgraph.serialize<SerializedGraph>(),
      });
    } catch (error) {
      this.logger.error('Error saving graph: ', error);
    }
  }
}
