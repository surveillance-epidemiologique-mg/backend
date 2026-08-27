import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional } from 'class-validator';

export class ImportJsonDto {
  @ApiProperty({
    description: 'Lignes à importer',
    example: [
      {
        maladie: 'Choléra',
        region: 'Analamanga',
        district: 'Antananarivo Renivohitra',
        centre: 'CSB2 Ambohidratrimo',
        date: '2026-08-26',
        suspects: 3,
        confirmes: 1,
        deces: 0,
        gueris: 0,
      },
    ],
  })
  @IsArray()
  rows!: any[];

  @IsOptional()
  @ApiProperty({ required: false })
  dryRun?: boolean;
}
