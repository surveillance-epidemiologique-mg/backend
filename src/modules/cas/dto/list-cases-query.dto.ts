import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { StatutDiag } from '../../../../generated/prisma/client';

export const AGE_RANGES = ['0-5', '6-17', '18-35', '36-60', '60+'] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export const AGE_BOUNDS: Record<AgeRange, { min: number; max: number | null }> = {
  '0-5': { min: 0, max: 5 },
  '6-17': { min: 6, max: 17 },
  '18-35': { min: 18, max: 35 },
  '36-60': { min: 36, max: 60 },
  '60+': { min: 60, max: null },
};

export class ListCasesQueryDto {
  @ApiPropertyOptional({
    description: "Recherche par nom du patient (name_patient) ou code anonyme (code_anonyme)",
    example: 'PAT-2026',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Année de date_diagnostic',
    example: 2026,
  })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    description:
      'Centre de santé (ignoré pour un Médecin qui reste limité à son centre)',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  centreId?: number;

  @ApiPropertyOptional({ description: 'Maladie', example: 14 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maladieId?: number;

  @ApiPropertyOptional({ description: 'Sexe du patient', enum: ['M', 'F'] })
  @IsOptional()
  @IsIn(['M', 'F'])
  gender?: string;

  @ApiPropertyOptional({ description: "Tranche d'âge du patient", enum: AGE_RANGES })
  @IsOptional()
  @IsIn(AGE_RANGES)
  ageRange?: AgeRange;

  @ApiPropertyOptional({
    description: 'Statut diagnostique',
    enum: StatutDiag,
  })
  @IsOptional()
  @IsEnum(StatutDiag)
  statut?: StatutDiag;
}