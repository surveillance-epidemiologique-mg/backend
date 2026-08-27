import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Adresse e-mail du compte',
    example: 'prenom.nom@surveillance.mg',
  })
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email!: string;
}
