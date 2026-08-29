import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { IssueClinique } from '../../../../generated/prisma/client';

export class UpdateIssueDto {
  @ApiProperty({
    description: 'Issue clinique',
    enum: IssueClinique,
    example: IssueClinique.Gueri,
  })
  @IsEnum(IssueClinique)
  clinicalOutcome!: IssueClinique;

  @ApiPropertyOptional({
    description: 'Date de l’issue',
    example: '2026-09-10',
  })
  @IsOptional()
  @IsDateString()
  outcomeDate?: string;
}
