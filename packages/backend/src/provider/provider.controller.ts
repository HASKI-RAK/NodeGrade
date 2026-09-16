import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Facilitator } from '../auth/decorators/facilitator.decorator.js';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto.js';
import { ProviderRuntimeService } from './provider-runtime.service.js';
import { ProviderService } from './provider.service.js';

@Controller('admin/providers')
@Facilitator()
export class ProviderController {
  constructor(
    private readonly providers: ProviderService,
    private readonly runtime: ProviderRuntimeService,
  ) {}

  @Get()
  async list() {
    return { providers: await this.providers.list() };
  }

  @Post()
  async create(@Body() body: CreateProviderDto) {
    const provider = await this.providers.create(body);
    this.runtime.invalidateCatalog();
    return { provider };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateProviderDto) {
    const provider = await this.providers.update(id, body);
    this.runtime.invalidateCatalog();
    return { provider };
  }

  @Post(':id/test')
  test(@Param('id') id: string) {
    return this.runtime.test(id);
  }
}
