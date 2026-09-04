import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({ description: 'Date de début (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Date de fin (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Zone administrative (id_zone)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  zoneId?: number;

  @ApiPropertyOptional({ description: 'Maladie (id_maladie)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maladieId?: number;

  @ApiPropertyOptional({ description: 'Dimension de répartition', enum: ['maladie', 'statut'] })
  @IsOptional()
  @IsIn(['maladie', 'statut'])
  dimension?: string;
}