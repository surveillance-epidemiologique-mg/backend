import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCaseDto {
  @ApiProperty({ description: 'Identifiant du patient anonyme', example: 1 })
  @IsInt()
  @Min(1)
  patientId!: number;

  @ApiProperty({ description: 'Identifiant de la maladie', example: 1 })
  @IsInt()
  @Min(1)
  maladieId!: number;

  @ApiProperty({ description: 'Identifiant du centre de santé', example: 1 })
  @IsInt()
  @Min(1)
  centreId!: number;

  @ApiPropertyOptional({ description: 'Symptômes observés' })
  @IsOptional()
  @IsString()
  symptoms?: string;

  @ApiProperty({ description: 'Date du diagnostic', example: '2026-08-29' })
  @IsDateString()
  diagnosisDate!: string;

  @ApiPropertyOptional({ description: 'Latitude (WGS84)', example: -18.91 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude (WGS84)', example: 47.53 })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
