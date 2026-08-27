import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
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

  @IsOptional()
  @IsString()
  @MaxLength(100)
  iconName?: string;

  @IsInt({ message: 'Le seuil d’alerte doit être un entier.' })
  @Min(1)
  alertThreshold!: number;

  @IsOptional()
  @IsString()
  description?: string;
}
