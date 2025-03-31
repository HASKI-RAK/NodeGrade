import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('graphs')
export class GraphController {
  private readonly logger = new Logger(GraphController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAllGraphs(@Res() response: Response): Promise<void> {
    try {
      const graphs = await this.prisma.graph.findMany();

      response.status(HttpStatus.OK).json(
        graphs.map((g) => ({
          id: g.id,
          path: g.path,
          graph: g.graph,
        })),
      );
    } catch (error) {
      this.logger.error('Error while fetching graphs: ', error);

      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Internal server error',
      });
    }
  }
}
