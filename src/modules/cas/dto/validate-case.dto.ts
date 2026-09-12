import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { StatutDiag } from '../../../../generated/prisma/client';

export class ValidateCaseDto {
  @ApiProperty({
    description: 'Statut final du cas',
    enum: [StatutDiag.Confirme, StatutDiag.Invalide],
    example: StatutDiag.Confirme,
  })
  @IsIn([StatutDiag.Confirme, StatutDiag.Invalide], {
    message: 'Le statut doit être Confirme ou Invalide.',
  })
  diagnosticStatus!: StatutDiag;

  @ApiPropertyOptional({
    description: "Référence de l'analyse ayant permis la décision",
    example: 12,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  analyseId?: number;
}