import { Response } from 'express';
import { Logger, Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { GraphService } from './graph.service';

@Controller('graphs')
export class GraphController {
  private readonly logger = new Logger(GraphController.name);

  constructor(private readonly graphService: GraphService) {}

  @Get()
  async findAllGraphs(@Res() response: Response): Promise<void> {
    const graphs = await this.graphService.findAllGraphs();

    if (graphs.length === 0) {
      this.logger.warn('No graphs found');
      response
        .status(HttpStatus.NOT_FOUND)
        .json({ message: 'No graphs found' });
      return;
    }

    response.status(HttpStatus.OK).json(
      graphs.map((g) => ({
        id: g.id,
        path: g.path,
        graph: g.graph,
      })),
    );
  }
}
