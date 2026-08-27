import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateSignalementDto {
  @ApiProperty({ description: 'Identifiant de la maladie', example: 18 })
  @IsInt({ message: 'La maladie doit être un identifiant entier.' })
  @Min(1)
  maladieId!: number;

  @ApiProperty({ description: 'Identifiant de la région', example: 1 })
  @IsInt({ message: 'La région doit être un identifiant entier.' })
  @Min(1)
  regionId!: number;

  @ApiProperty({ description: 'Identifiant du district', example: 2 })
  @IsInt({ message: 'Le district doit être un identifiant entier.' })
  @Min(1)
  districtId!: number;

  @ApiProperty({ description: "Identifiant de l'établissement", example: 1 })
  @IsInt({ message: "L'établissement doit être un identifiant entier." })
  @Min(1)
  centreId!: number;

  @ApiProperty({
    description: 'Date du signalement',
    example: '2026-08-26',
  })
  @IsDateString({}, { message: 'Date du signalement invalide.' })
  @IsNotEmpty({ message: 'La date du signalement est requise.' })
  dateSignalement!: string;

  @ApiPropertyOptional({
    description: 'Nombre de cas suspects',
    example: 5,
  })
  @IsOptional()
  @IsInt({ message: 'Le nombre de cas suspects doit être un entier.' })
  @Min(0, { message: 'Le nombre de cas suspects ne peut pas être négatif.' })
  nbCasSuspects?: number;

  @ApiPropertyOptional({
    description: 'Nombre de cas confirmés',
    example: 2,
  })
  @IsOptional()
  @IsInt({ message: 'Le nombre de cas confirmés doit être un entier.' })
  @Min(0, { message: 'Le nombre de cas confirmés ne peut pas être négatif.' })
  nbCasConfirmes?: number;

  @ApiPropertyOptional({
    description: 'Nombre de décès',
    example: 0,
  })
  @IsOptional()
  @IsInt({ message: 'Le nombre de décès doit être un entier.' })
  @Min(0, { message: 'Le nombre de décès ne peut pas être négatif.' })
  nbDeces?: number;

  @ApiPropertyOptional({
    description: 'Nombre de guéris',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Le nombre de guéris doit être un entier.' })
  @Min(0, { message: 'Le nombre de guéris ne peut pas être négatif.' })
  nbGueris?: number;
}
