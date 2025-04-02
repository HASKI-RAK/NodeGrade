import { Response } from 'express';
import { Logger, Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { GraphService } from './graph.service';

@Controller('graphs')
export class GraphController {
  private readonly logger = new Logger(GraphController.name);

  constructor(private readonly graphService: GraphService) {}

  @Get('all')
  async findAllGraphs(@Res() response: Response): Promise<void> {
    const graphs = await this.graphService.findAllGraphs();

    response.status(HttpStatus.OK).json(
      graphs.map((g) => ({
        id: g.id,
        path: g.path,
        graph: g.graph,
      })),
    );
  }
}
