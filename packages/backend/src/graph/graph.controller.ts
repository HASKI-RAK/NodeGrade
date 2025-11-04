import type { Request, Response } from 'express';
import {
  Logger,
  Controller,
  Get,
  Options,
  Res,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { GraphService } from './graph.service';

@Controller('graphs')
export class GraphController {
  private readonly logger = new Logger(GraphController.name);

  constructor(private readonly graphService: GraphService) {}

  private setCorsHeaders(req: Request, res: Response) {
    const allowedOrigins = (
      process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',')
        : ['https://nodegrade.haski.app']
    ).map((o) => o.trim().replace(/^"|"$/g, ''));
    const origin = (req.headers.origin as string) || '';

    this.logger.debug(
      `CORS check: origin=${origin}, allowed=${allowedOrigins.join(',')}`,
    );

    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Origin, X-Requested-With, Accept',
      );
      res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.header('Vary', 'Origin');
    } else {
      this.logger.warn(
        `Origin ${origin} not in allowed list: ${allowedOrigins.join(',')}`,
      );
    }
  }

  @Options()
  handleOptions(
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    this.setCorsHeaders(request, response);
    response.status(HttpStatus.NO_CONTENT).send();
  }

  @Get()
  async findAllGraphs(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    this.setCorsHeaders(request, response);

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
