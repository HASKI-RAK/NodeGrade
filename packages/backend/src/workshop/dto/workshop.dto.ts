import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** One template a workshop offers (SPEC-0022/FR-001). */
export class WorkshopTemplateEntryDto {
  @IsString()
  @MinLength(1)
  templateId!: string;

  /** A revision of that template to pin; absent or null follows the newest revision. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  templateRevisionId?: string | null;
}

/** The templates of a workshop, in display order (FR-005). */
export class WorkshopTemplatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WorkshopTemplateEntryDto)
  templates!: WorkshopTemplateEntryDto[];
}

export class CreateWorkshopDto extends WorkshopTemplatesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
