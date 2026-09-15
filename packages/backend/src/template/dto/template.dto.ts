import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { TemplateKind } from '../../generated/prisma/enums.js';

const MAX_CONTENT_LENGTH = 2 * 1024 * 1024;

export class TemplateMetadataDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class CreateTemplateDto extends TemplateMetadataDto {
  // Slugs are part of the public URL and are quoted in workshop material, so they are
  // chosen rather than derived.
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase words separated by single hyphens',
  })
  @MaxLength(60)
  slug!: string;

  @IsIn(['WORKFLOW', 'BLOCK'])
  kind!: TemplateKind;

  @IsString()
  @MaxLength(MAX_CONTENT_LENGTH)
  content!: string;

  /** Declared external ports. Only meaningful for BLOCK templates (FR-019). */
  @IsOptional()
  @IsObject()
  interfaces?: object;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class CreateRevisionDto extends TemplateMetadataDto {
  @IsString()
  @MaxLength(MAX_CONTENT_LENGTH)
  content!: string;

  @IsOptional()
  @IsObject()
  interfaces?: object;
}

export class SetPublishedDto {
  @IsBoolean()
  published!: boolean;
}

export class TemplateQueryDto {
  @IsOptional()
  @IsIn(['WORKFLOW', 'BLOCK'])
  kind?: TemplateKind;
}

export class AdminTemplateQueryDto extends TemplateQueryDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeDeleted?: boolean;
}

export class RevisionParamDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  revision!: number;
}
