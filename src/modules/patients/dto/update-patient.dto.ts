import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdatePatientDto {
  @ApiPropertyOptional({ description: 'Nom du patient', example: 'Patient 01' })
  @IsOptional()
  @IsString()
  @MinLength(2, {
    message: 'Le nom du patient doit contenir au moins 2 caractères.',
  })
  namePatient?: string;

  @ApiPropertyOptional({ description: 'Âge (années)', example: 34 })
  @IsOptional()
  @IsInt()
  @Min(0)
  age?: number;

  @ApiPropertyOptional({ description: 'Sexe', example: 'M' })
  @IsOptional()
  @IsIn(['M', 'F'])
  gender?: string;
}