import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LGraph, LGraphNode } from '@haski/ta-lib';

@Injectable()
export class GraphService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllGraphs() {
    return this.prisma.graph.findMany();
  }

  //TODO: doesnt belong here
  /**
   * Run the graph in order
   * first compute the execution order
   * then run each node
   * @async
   * @param lgraph - graph to run
   * @param updateProggresCb - callback to update progress
   * @param onlyOnExecute - flag to compute execution order only for onExecute nodes
   */
  async runLgraph(
    lgraph: LGraph,
    updateProggresCb?: (progress: number) => void,
    onlyOnExecute = false,
  ) {
    const execorder = lgraph.computeExecutionOrder<LGraphNode[]>(
      onlyOnExecute,
      true,
    );
    for (const [index, node] of execorder.entries()) {
      try {
        await node.onExecute?.();
        updateProggresCb?.(index / execorder.length);
      } catch (error) {
        console.error('Error executing node:', error);
        // Optionally log the error or handle it as needed
        // Handle node execution errors
        // TODO: Reset node green states or handle errors appropriately
      }
    }
    return lgraph;
  }
}
