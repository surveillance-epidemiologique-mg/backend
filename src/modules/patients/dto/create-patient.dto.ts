import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class CreatePatientDto {
  @ApiPropertyOptional({ description: 'Âge (années)', example: 34 })
  @IsOptional()
  @IsInt()
  @Min(0)
  age?: number;

  @ApiPropertyOptional({ description: 'Sexe', example: 'M' })
  @IsOptional()
  @IsIn(['M', 'F'])
  gender?: string;

  @ApiPropertyOptional({ description: 'Zone de résidence', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  residenceZoneId?: number;
}
