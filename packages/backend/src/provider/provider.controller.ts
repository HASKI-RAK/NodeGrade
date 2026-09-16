import { Controller, Get } from '@nestjs/common';
import { Facilitator } from '../auth/decorators/facilitator.decorator.js';
import { ProviderService } from './provider.service.js';

@Controller('admin/providers')
@Facilitator()
export class ProviderController {
  constructor(private readonly providers: ProviderService) {}

  @Get()
  async list() {
    return { providers: await this.providers.list() };
  }
}
