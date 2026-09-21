import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { StatutDiag } from '../../../../generated/prisma/client';

export class CarteQueryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id_maladie?: number;

  // Compatibility with clients using the previous cases endpoint.
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  maladieId?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(StatutDiag)
  statut?: StatutDiag;

  /** Bypass the short in-memory cache after a métier event. */
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  @ValidateIf((_object, value) => value !== undefined)
  refresh?: boolean;
}
