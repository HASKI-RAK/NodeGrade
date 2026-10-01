import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWorkspaceDto {
  /** Purely cosmetic — a participant may name their workspace, nothing depends on it. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
