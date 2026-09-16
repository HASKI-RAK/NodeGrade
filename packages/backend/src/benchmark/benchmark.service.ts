import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import {
  AnswerInputNode,
  LiteGraph,
  OutputNode,
  QuestionNode,
  SampleSolutionNode,
} from '@haski/ta-lib';
import { executeLgraph } from '../core/Graph.js';

@Injectable()
export class BenchmarkService {
  constructor(private readonly prisma: PrismaService) {}

  async runBenchmark({
    workflowId,
    data,
  }: {
    workflowId: string;
    data: { question: string; realAnswer: string; answer: string };
  }) {
    const graph = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { content: true },
    });

    if (!graph) throw new Error('Graph not found');

    const lgraph = new LiteGraph.LGraph();
    // addOnNodeAdded(lgraph, undefined, true);
    lgraph.configure(JSON.parse(graph.content));

    // Fill in the answer and question
    lgraph.findNodesByClass(QuestionNode).forEach((node) => {
      node.properties.value = data.question;
    });
    lgraph.findNodesByClass(SampleSolutionNode).forEach((node) => {
      node.properties.value = data.realAnswer;
    });
    lgraph.findNodesByClass(AnswerInputNode).forEach((node) => {
      node.properties.value = data.answer;
    });

    const result = await executeLgraph(lgraph);

    return result
      .findNodesByClass(OutputNode)
      .map((node) => node.properties.value);
  }
}
