import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class InviteUserDto {
  @ApiProperty({
    description: 'Nom complet de l’utilisateur invité',
    example: 'Dr Rakoto',
  })
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  name!: string;

  @ApiPropertyOptional({ description: 'Prénom', example: 'Jean' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Nom de famille', example: 'Rakoto' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({
    description: 'Adresse e-mail de l’utilisateur invité',
    example: 'medecin@example.com',
  })
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email!: string;

  @ApiProperty({
    description: 'Identifiant du rôle',
    example: 2,
  })
  @IsInt({ message: 'Le rôle doit être un identifiant entier.' })
  @Min(1)
  roleId!: number;

  @ApiPropertyOptional({
    description: 'Identifiant du centre de santé (optionnel)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Le centre de santé doit être un identifiant entier.' })
  @Min(1)
  centreId?: number;

  @ApiPropertyOptional({
    description: 'Identifiant de la région (pour les rôles régionaux)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'La région doit être un identifiant entier.' })
  @Min(1)
  regionId?: number;

  @ApiPropertyOptional({
    description: 'Numéro de téléphone (optionnel)',
    example: '+261340000000',
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Statut du compte (actif/inactif)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
