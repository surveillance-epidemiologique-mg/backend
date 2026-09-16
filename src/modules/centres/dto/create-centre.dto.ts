import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { TypeCentre } from '../../../../generated/prisma/client';

export class CreateCentreDto {
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  name!: string;

  @IsEnum(TypeCentre, { message: 'Type de centre invalide.' })
  type!: TypeCentre;

  @IsInt({ message: 'La zone doit être un identifiant entier.' })
  @Min(1)
  zoneId!: number;

  @IsOptional()
  @IsNumber()
  @Min(-90, { message: 'La latitude doit être entre -90 et 90.' })
  @Max(90, { message: 'La latitude doit être entre -90 et 90.' })
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180, { message: 'La longitude doit être entre -180 et 180.' })
  @Max(180, { message: 'La longitude doit être entre -180 et 180.' })
  longitude?: number;
}