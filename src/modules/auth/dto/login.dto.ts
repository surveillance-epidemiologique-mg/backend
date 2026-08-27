import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Adresse e-mail de l’utilisateur',
    example: 'admin@surveillance.mg',
  })
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email!: string;

  @ApiProperty({
    description: 'Mot de passe',
    example: 'MotDePasse1!',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est requis.' })
  password!: string;

  @ApiPropertyOptional({
    description:
      'Si vrai, prolonge la durée de session (« Se souvenir de moi »)',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'rememberMe doit être un booléen.' })
  rememberMe?: boolean;
}
