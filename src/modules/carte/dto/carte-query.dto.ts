import { Type } from 'class-transformer';
import { IsEnum, IsInt, Max, Min, ValidateIf } from 'class-validator';
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
}
