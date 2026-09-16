import { Controller, Get } from '@nestjs/common';
import { ProviderRuntimeService } from './provider-runtime.service.js';

@Controller('models')
export class ModelController {
  constructor(private readonly runtime: ProviderRuntimeService) {}

  @Get()
  list() {
    return this.runtime.catalog();
  }
}
