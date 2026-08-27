import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TypeZone } from '../../../../generated/prisma/client';

export class CreateZoneDto {
  @ApiProperty({ description: 'Nom de la zone', example: 'Vakinankaratra' })
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  name!: string;

  @ApiProperty({
    description: 'Type de zone',
    enum: TypeZone,
    example: TypeZone.Region,
  })
  @IsEnum(TypeZone, { message: 'Type de zone invalide.' })
  type!: TypeZone;

  @ApiPropertyOptional({ description: 'Code PCODE (optionnel)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pcode?: string;

  @ApiPropertyOptional({ description: 'Identifiant de la zone parente' })
  @IsOptional()
  @IsInt({ message: 'La zone parente doit être un identifiant entier.' })
  @Min(1)
  parentId?: number;
}
