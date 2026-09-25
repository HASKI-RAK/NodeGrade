import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CurrentWorkspace,
  WorkspaceScoped,
} from './decorators/current-workspace.decorator.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import type { ResolvedWorkspace } from './workspace.service.js';
import { WorkspaceService } from './workspace.service.js';
import { WorkspaceCreationThrottle } from './workspace-creation-throttle.js';

@Controller('workspaces')
export class WorkspaceController {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly throttle: WorkspaceCreationThrottle,
  ) {}

  /**
   * Establishes an anonymous participant's workspace (SPEC-0004/FR-003).
   *
   * Unauthenticated by necessity: this is where the caller's only credential comes from.
   * The token is in the response body and nowhere else — it is never returned again.
   */
  @Post()
  async create(
    @Body() body: CreateWorkspaceDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const key = request.ip ?? 'unknown';
    const retryAfterMs = this.throttle.retryAfterMs(key);
    if (retryAfterMs > 0) {
      const retryAfter = Math.ceil(retryAfterMs / 1000);
      response.setHeader('Retry-After', String(retryAfter));
      // @nestjs/common has no TooManyRequestsException.
      throw new HttpException(
        {
          code: 'too_many_requests',
          message: `Too many workspaces created from this address. Try again in ${retryAfter} seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.throttle.record(key);

    const workspace = await this.workspaces.createBrowser(body.label);

    return {
      workspace: {
        id: workspace.id,
        type: workspace.type,
        label: workspace.label,
        workshopId: workspace.workshopId,
        createdAt: workspace.createdAt.toISOString(),
      },
      token: workspace.token,
    };
  }

  /** Lets a client confirm its stored token still resolves before restoring the editor. */
  @Get('me')
  @WorkspaceScoped()
  me(@CurrentWorkspace() workspace: ResolvedWorkspace) {
    return {
      id: workspace.id,
      type: workspace.type,
      label: workspace.label,
      workshopId: workspace.workshopId,
      workshop: workspace.workshop ?? null,
    };
  }
}
