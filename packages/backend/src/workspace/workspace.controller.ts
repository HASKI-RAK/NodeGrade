import { Controller, Get } from '@nestjs/common';
import {
  CurrentWorkspace,
  WorkspaceScoped,
} from './decorators/current-workspace.decorator.js';
import type { ResolvedWorkspace } from './workspace.service.js';

/**
 * A participant's view of their own workspace. There is no way to create one here: a
 * workspace comes from a workshop join or an LTI launch (SPEC-0022/FR-013).
 */
@Controller('workspaces')
export class WorkspaceController {
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
