import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Mot de passe actuel',
    example: 'AncienMotDePasse1!',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe actuel est requis.' })
  currentPassword!: string;

  @ApiProperty({
    description:
      'Nouveau mot de passe (min. 8 caractères, avec majuscule, minuscule, chiffre et caractère spécial)',
    example: 'NouveauMotDePasse1!',
  })
  @IsString()
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères.',
  })
  @Matches(
    /^(?=(?:.*[a-z])|(?:.*[A-Z])|(?:.*\d)|(?:.*[^A-Za-z0-9])).+$/,
    {
      message:
        'Le mot de passe doit contenir au moins deux types de caractères parmi : minuscule, majuscule, chiffre et caractère spécial.',
    },
  )
  newPassword!: string;
}
