import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RUN_FILTERS, type RunFilter } from '../run.service.js';

export class ListRunsQueryDto {
  @IsOptional()
  @IsIn(RUN_FILTERS)
  filter?: RunFilter;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;
}

export class SetRunReviewDto {
  @IsBoolean()
  reviewed!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
