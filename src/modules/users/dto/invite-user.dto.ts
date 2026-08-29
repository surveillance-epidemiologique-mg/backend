import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
    example: 'Dr RAKOTO Jean',
  })
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  name!: string;

  @ApiProperty({
    description: 'Adresse e-mail de l’utilisateur invité',
    example: 'medecin@example.com',
  })
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email!: string;

  @ApiProperty({ description: 'Identifiant du rôle', example: 2 })
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
    description: 'Numéro de téléphone (optionnel)',
    example: '+261340000000',
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
