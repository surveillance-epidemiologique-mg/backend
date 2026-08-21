import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

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
}
