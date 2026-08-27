import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { NiveauRisque } from '../../../../generated/prisma/client';

export class CreateRegleAlerteDto {
  @ApiProperty({
    description: 'Nom de la règle',
    example: 'Choléra - 2 cas / 7 j',
  })
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  name!: string;

  @ApiPropertyOptional({ description: 'Description de la règle' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Maladie concernée (null = toutes les maladies)',
  })
  @IsOptional()
  @IsInt({ message: 'La maladie doit être un identifiant entier.' })
  @Min(1)
  maladieId?: number;

  @ApiProperty({ description: 'Zone surveillée (région ou district)' })
  @IsInt({ message: 'La zone doit être un identifiant entier.' })
  @Min(1)
  zoneId!: number;

  @ApiPropertyOptional({
    description: 'Fenêtre de détection en jours',
    example: 7,
  })
  @IsOptional()
  @IsInt({ message: 'La période doit être un entier.' })
  @Min(1)
  periodDays?: number;

  @ApiProperty({
    description: 'Seuil de déclenchement (nombre de cas)',
    example: 2,
  })
  @IsInt({ message: 'Le seuil doit être un entier.' })
  @Min(1)
  threshold!: number;

  @ApiProperty({
    description: 'Niveau de risque déclenché',
    enum: NiveauRisque,
    example: NiveauRisque.Alerte,
  })
  @IsEnum(NiveauRisque, { message: 'Niveau de risque invalide.' })
  niveau!: NiveauRisque;

  @ApiPropertyOptional({ description: 'Règle active', default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
