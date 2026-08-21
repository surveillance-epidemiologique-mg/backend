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
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}
