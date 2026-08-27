import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateSignalementDto {
  @ApiPropertyOptional({ description: 'Identifiant de la maladie' })
  @IsOptional()
  @IsInt({ message: 'La maladie doit être un identifiant entier.' })
  @Min(1)
  maladieId?: number;

  @ApiPropertyOptional({ description: 'Identifiant de la région' })
  @IsOptional()
  @IsInt({ message: 'La région doit être un identifiant entier.' })
  @Min(1)
  regionId?: number;

  @ApiPropertyOptional({ description: 'Identifiant du district' })
  @IsOptional()
  @IsInt({ message: 'Le district doit être un identifiant entier.' })
  @Min(1)
  districtId?: number;

  @ApiPropertyOptional({ description: "Identifiant de l'établissement" })
  @IsOptional()
  @IsInt({ message: "L'établissement doit être un identifiant entier." })
  @Min(1)
  centreId?: number;

  @ApiPropertyOptional({ description: 'Date du signalement' })
  @IsOptional()
  @IsDateString({}, { message: 'Date du signalement invalide.' })
  dateSignalement?: string;

  @ApiPropertyOptional({ description: 'Nombre de cas suspects' })
  @IsOptional()
  @IsInt({ message: 'Le nombre de cas suspects doit être un entier.' })
  @Min(0)
  nbCasSuspects?: number;

  @ApiPropertyOptional({ description: 'Nombre de cas confirmés' })
  @IsOptional()
  @IsInt({ message: 'Le nombre de cas confirmés doit être un entier.' })
  @Min(0)
  nbCasConfirmes?: number;

  @ApiPropertyOptional({ description: 'Nombre de décès' })
  @IsOptional()
  @IsInt({ message: 'Le nombre de décès doit être un entier.' })
  @Min(0)
  nbDeces?: number;

  @ApiPropertyOptional({ description: 'Nombre de guéris' })
  @IsOptional()
  @IsInt({ message: 'Le nombre de guéris doit être un entier.' })
  @Min(0)
  nbGueris?: number;
}
