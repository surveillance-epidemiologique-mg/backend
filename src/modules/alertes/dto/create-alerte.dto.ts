import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { NiveauRisque } from '../../../../generated/prisma/client';

export class CreateAlerteDto {
  @ApiProperty({ description: 'Identifiant de la maladie', example: 18 })
  @IsInt({ message: 'La maladie doit être un identifiant entier.' })
  @Min(1)
  maladieId!: number;

  @ApiProperty({ description: 'Identifiant de la zone (région ou district)' })
  @IsInt({ message: 'La zone doit être un identifiant entier.' })
  @Min(1)
  zoneId!: number;

  @ApiProperty({
    description: 'Niveau de risque',
    enum: NiveauRisque,
    example: NiveauRisque.Alerte,
  })
  @IsEnum(NiveauRisque, { message: 'Niveau de risque invalide.' })
  niveauRisque!: NiveauRisque;

  @ApiPropertyOptional({ description: 'Nombre de cas détectés', example: 3 })
  @IsOptional()
  @IsInt({ message: 'Le nombre de cas doit être un entier.' })
  @Min(0)
  detectedCaseCount?: number;

  @ApiPropertyOptional({ description: 'Commentaire' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
