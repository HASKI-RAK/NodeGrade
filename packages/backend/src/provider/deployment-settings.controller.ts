import { Body, Controller, Get, Put } from '@nestjs/common';
import { Facilitator } from '../auth/decorators/facilitator.decorator.js';
import { DeploymentSettingsService } from './deployment-settings.service.js';
import { DeploymentSettingsDto } from './dto/provider.dto.js';
import { ProviderRuntimeService } from './provider-runtime.service.js';

@Controller('admin/deployment-settings')
@Facilitator()
export class DeploymentSettingsController {
  constructor(
    private readonly settings: DeploymentSettingsService,
    private readonly runtime: ProviderRuntimeService,
  ) {}

  @Get()
  async read() {
    return this.settings.get();
  }

  @Put()
  async update(@Body() body: DeploymentSettingsDto) {
    const updated = await this.settings.update(body);
    this.runtime.invalidateCatalog();
    return updated;
  }
}
