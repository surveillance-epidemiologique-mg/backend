import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { TypeResultatAttendu } from '../../../../generated/prisma/client';

export class CreateAnalyseDto {
  @ApiProperty({
    description: "Libellé de l'analyse demandée",
    example: 'PCR paludisme',
  })
  @IsString()
  @MinLength(2, {
    message: "Le libellé de l'analyse doit contenir au moins 2 caractères.",
  })
  label!: string;

  @ApiProperty({
    description: 'Type de résultat attendu',
    enum: TypeResultatAttendu,
    example: TypeResultatAttendu.ChoixPositifNegatif,
  })
  @IsEnum(TypeResultatAttendu, { message: 'Type de résultat invalide.' })
  typeResultatAttendu!: TypeResultatAttendu;
}