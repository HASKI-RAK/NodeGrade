import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CredentialUpdateDto {
  @IsIn(['KEEP', 'REPLACE', 'REMOVE'])
  mode!: 'KEEP' | 'REPLACE' | 'REMOVE';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  value?: string;
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
}
