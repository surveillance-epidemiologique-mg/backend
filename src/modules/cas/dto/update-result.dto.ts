import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { StatutDiag } from '../../../../generated/prisma/client';

export class UpdateResultDto {
  @ApiProperty({ description: 'Résultat biologique', example: 'Positif' })
  @IsString()
  labResult!: string;

  @ApiProperty({
    description: 'Nouveau statut diagnostique',
    enum: StatutDiag,
    example: StatutDiag.Confirme,
  })
  @IsEnum(StatutDiag)
  diagnosticStatus!: StatutDiag;
}
