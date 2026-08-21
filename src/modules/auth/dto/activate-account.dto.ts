import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ActivateAccountDto {
  @ApiProperty({
    description: "Token d'activation reçu par e-mail",
    example: '75f7d9cdd445c6009d38164686548fd2d084d9b3f60d155d0e1b033075709422',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le token de réinitialisation est requis.' })
  token!: string;

  @ApiProperty({
    description:
      'Nouveau mot de passe (min. 8 caractères, avec majuscule, minuscule, chiffre et caractère spécial)',
    example: 'MonMotDePasse1!',
  })
  @IsString()
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères.',
  })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'Le mot de passe doit contenir une majuscule, une minuscule, un chiffre et un caractère spécial.',
  })
  newPassword!: string;
}
