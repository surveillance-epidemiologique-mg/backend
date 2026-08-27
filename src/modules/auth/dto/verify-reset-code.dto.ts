import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches } from 'class-validator';

export class VerifyResetCodeDto {
  @ApiProperty({
    description: 'Adresse e-mail du compte',
    example: 'prenom.nom@surveillance.mg',
  })
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email!: string;

  @ApiProperty({
    description: 'Code de vérification à 6 chiffres reçu par e-mail',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'Le code doit contenir exactement 6 chiffres.',
  })
  code!: string;
}
