import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Facilitator } from '../auth/decorators/facilitator.decorator.js';
import {
  CurrentWorkspace,
  WorkspaceScoped,
} from '../workspace/decorators/current-workspace.decorator.js';
import { WorkspaceCreationThrottle } from '../workspace/workspace-creation-throttle.js';
import type { ResolvedWorkspace } from '../workspace/workspace.service.js';
import { parseBearerToken } from '../workspace/workspace-token.js';
import { CreateWorkshopDto, WorkshopTemplatesDto } from './dto/workshop.dto.js';
import { WorkshopParticipantService } from './workshop-participant.service.js';
import { WorkshopReadinessService } from './workshop-readiness.service.js';
import { WorkshopService } from './workshop.service.js';

@Controller('workshops')
export class WorkshopController {
  constructor(
    private readonly workshops: WorkshopService,
    private readonly readiness: WorkshopReadinessService,
    private readonly participants: WorkshopParticipantService,
    private readonly throttle: WorkspaceCreationThrottle,
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

  /**
   * The only way a participant obtains a workspace (SPEC-0022/FR-013). Unauthenticated by
   * necessity, so creating a workspace here is rate-limited per address (FR-015); a
   * re-join with the workshop's token is not.
   */
  @Post('by-code/:code/join')
  join(
    @Param('code') code: string,
    @Headers('authorization') authorization: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const key = request.ip ?? 'unknown';
    return this.participants.join(
      code,
      parseBearerToken(authorization) ?? undefined,
      () => {
        const retryAfterMs = this.throttle.retryAfterMs(key);
        if (retryAfterMs > 0) {
          const retryAfter = Math.ceil(retryAfterMs / 1000);
          response.setHeader('Retry-After', String(retryAfter));
          // @nestjs/common has no TooManyRequestsException.
          throw new HttpException(
            {
              code: 'too_many_requests',
              message: `Too many participants joined from this address. Try again in ${retryAfter} seconds.`,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        this.throttle.record(key);
      },
    );
  }
}

/** A participant's own workshop, resolved from their token (SPEC-0022/FR-008 to FR-010). */
@Controller('workshops/current')
@WorkspaceScoped()
export class WorkshopParticipantController {
  constructor(private readonly participants: WorkshopParticipantService) {}

  @Get()
  current(@CurrentWorkspace() workspace: ResolvedWorkspace) {
    return this.participants.current(workspace);
  }

  @Get('entries/:entryId/structure')
  structure(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('entryId') entryId: string,
  ) {
    return this.participants.structure(workspace, entryId);
  }

  @Post('entries/:entryId/start')
  start(
    @CurrentWorkspace() workspace: ResolvedWorkspace,
    @Param('entryId') entryId: string,
  ) {
    return this.participants.start(workspace, entryId);
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

  /** Replaces the templates a workshop offers (SPEC-0022/FR-005). */
  @Put(':id/templates')
  async replaceTemplates(
    @Param('id') id: string,
    @Body() body: WorkshopTemplatesDto,
  ) {
    return {
      workshop: this.workshops.serialize(
        await this.workshops.replaceTemplates(id, body.templates),
      ),
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
