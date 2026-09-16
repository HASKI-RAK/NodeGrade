import { Body, Controller, Get, Put } from '@nestjs/common';
import { Facilitator } from '../auth/decorators/facilitator.decorator.js';
import { ExecutionLimitsDto } from './dto/provider.dto.js';
import { ExecutionLimitsService } from './execution-limits.service.js';

@Controller('admin/execution-limits')
@Facilitator()
export class ExecutionLimitsController {
  constructor(private readonly limits: ExecutionLimitsService) {}

  @Get()
  async read() {
    return { limits: await this.limits.get() };
  }

  @Put()
  async update(@Body() body: ExecutionLimitsDto) {
    return { limits: await this.limits.update(body) };
  }
}
