import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Facilitator } from '../auth/decorators/facilitator.decorator.js';
import { parseBearerToken } from '../workspace/workspace-token.js';
import { CreateWorkshopDto } from './dto/workshop.dto.js';
import { WorkshopReadinessService } from './workshop-readiness.service.js';
import { WorkshopService } from './workshop.service.js';

@Controller('workshops')
export class WorkshopController {
  constructor(
    private readonly workshops: WorkshopService,
    private readonly readiness: WorkshopReadinessService,
  ) {}

  @Get('by-code/:code')
  async byCode(@Param('code') code: string) {
    const workshop = await this.workshops.resolve(code);
    return {
      workshop: {
        id: workshop.id,
        code: workshop.code,
        title: workshop.title,
        expiresAt: workshop.expiresAt?.toISOString() ?? null,
      },
    };
  }

  /** Preflight before a participant is started into the workshop (FR-009). */
  @Get('by-code/:code/preflight')
  preflight(@Param('code') code: string) {
    return this.readiness.byCode(code);
  }

  @Post('by-code/:code/join')
  join(
    @Param('code') code: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.workshops.join(
      code,
      parseBearerToken(authorization) ?? undefined,
    );
  }
}

@Controller('admin/workshops')
@Facilitator()
export class AdminWorkshopController {
  constructor(
    private readonly workshops: WorkshopService,
    private readonly readiness: WorkshopReadinessService,
  ) {}

  @Get()
  async list() {
    const workshops = await this.workshops.list();
    return {
      workshops: workshops.map((item) => this.workshops.serialize(item)),
    };
  }

  @Post()
  async create(@Body() body: CreateWorkshopDto) {
    return {
      workshop: this.workshops.serialize(await this.workshops.create(body)),
    };
  }

  /** Facilitator readiness view (FR-010). */
  @Get(':id/readiness')
  readinessOf(@Param('id') id: string) {
    return this.readiness.byId(id);
  }

  @Post(':id/publish')
  async publish(@Param('id') id: string) {
    return {
      workshop: this.workshops.serialize(await this.workshops.publish(id)),
    };
  }

  @Post(':id/close')
  async close(@Param('id') id: string) {
    return {
      workshop: this.workshops.serialize(await this.workshops.close(id)),
    };
  }
}
