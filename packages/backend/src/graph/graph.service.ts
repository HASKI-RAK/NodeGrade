import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LGraph } from '@haski/ta-lib';

@Injectable()
export class GraphService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllGraphs() {
    return this.prisma.graph.findMany();
  }

  async saveGraph(pathname: string, graph: LGraph) {
    try {
      await this.prisma.graph.findFirstOrThrow({
        where: {
          path: pathname ?? '',
        },
      });

      await this.prisma.graph.update({
        where: {
          path: pathname ?? '',
        },
        data: {
          graph: JSON.stringify(graph.serialize()),
        },
      });
    } catch {
      await this.prisma.graph.create({
        data: {
          path: pathname ?? '',
          graph: JSON.stringify(graph.serialize()),
        },
      });
    }
  }

  async getGraph(pathname: string) {
    const graph = await this.prisma.graph.findFirst({
      where: {
        path: pathname ?? '',
      },
    });
    return graph;
  }
}
