import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Facilitator } from '../auth/decorators/facilitator.decorator.js';
import { parseBearerToken } from '../workspace/workspace-token.js';
import { CreateWorkshopDto } from './dto/workshop.dto.js';
import { WorkshopService } from './workshop.service.js';

@Controller('workshops')
export class WorkshopController {
  constructor(private readonly workshops: WorkshopService) {}

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
  constructor(private readonly workshops: WorkshopService) {}

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
