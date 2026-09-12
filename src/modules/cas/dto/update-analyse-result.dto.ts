import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateAnalyseResultDto {
  @ApiProperty({
    description: "Résultat de l'analyse",
    example: 'Positif',
  })
  @IsString()
  resultat!: string;
}