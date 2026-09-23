import { Type } from 'class-transformer';
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

  @ApiPropertyOptional({
    description: 'Centre de santé (0 = tous les centres)',
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  centreId?: number;

  @ApiPropertyOptional({ description: 'Dimension de répartition', enum: ['maladie', 'statut'] })
  @IsOptional()
  @IsIn(['maladie', 'statut'])
  dimension?: string;
}
