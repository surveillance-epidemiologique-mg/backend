import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { TypeCentre } from '../../../../generated/prisma/client';

export class UpdateCentreDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  name?: string;

  @IsOptional()
  @IsEnum(TypeCentre, { message: 'Type de centre invalide.' })
  type?: TypeCentre;

  @IsOptional()
  @IsInt({ message: 'La zone doit être un identifiant entier.' })
  @Min(1)
  zoneId?: number;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}