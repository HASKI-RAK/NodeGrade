import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { ModelPolicyMode } from '../../generated/prisma/enums.js';

export class CredentialUpdateDto {
  @IsIn(['KEEP', 'REPLACE', 'REMOVE'])
  mode!: 'KEEP' | 'REPLACE' | 'REMOVE';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  value?: string;
}

export class ModelPolicyDto {
  @IsIn(['DENY_ALL', 'ALLOWLIST', 'ALLOW_ALL'])
  mode!: ModelPolicyMode;

  /** Model ids of this provider's catalog. Ignored outside ALLOWLIST mode. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  allowedModels?: string[];
}

export class DeploymentSettingsDto {
  /** Provider-qualified default model (ModelRef). Both null clears the default. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  providerKey?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  modelId?: string | null;
}

export class ExecutionLimitsDto {
  @IsInt()
  @Min(1)
  @Max(100)
  workspaceConcurrentRuns!: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  providerConcurrentRequests!: number;
}

export class CreateProviderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  baseUrl!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CredentialUpdateDto)
  credential?: CredentialUpdateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ModelPolicyDto)
  policy?: ModelPolicyDto;
}

export class UpdateProviderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  baseUrl?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CredentialUpdateDto)
  credential?: CredentialUpdateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ModelPolicyDto)
  policy?: ModelPolicyDto;
}
