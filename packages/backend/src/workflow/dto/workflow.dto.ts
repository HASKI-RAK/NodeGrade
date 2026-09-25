import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Serialized LiteGraph content. A real workflow runs ~30 KB; the cap is generous enough
 * for a large one with long prompts and small enough that a single request cannot be
 * used to fill the database. The Express body limit in main.ts is set above it.
 */
const MAX_CONTENT_LENGTH = 2 * 1024 * 1024;

export class CreateWorkflowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(MAX_CONTENT_LENGTH)
  content!: string;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CONTENT_LENGTH)
  content?: string;
}
