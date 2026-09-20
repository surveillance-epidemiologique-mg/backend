import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMaladieDto {
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  icd10Code?: string;

  @IsInt({ message: 'Le seuil d’alerte doit être un entier.' })
  @Min(1)
  @Max(2147483647)
  alertThresholdCentre!: number;

  @IsInt({ message: 'Le seuil de zone doit être un entier.' })
  @Min(1)
  @Max(2147483647)
  alertThresholdRegion!: number;

  @IsOptional()
  @IsString()
  description?: string;
}
