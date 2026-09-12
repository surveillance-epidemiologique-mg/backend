import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { StatutDiag, TypeResultatAttendu } from '../../../../generated/prisma/client';

export class NewPatientDto {
  @ApiProperty({ description: 'Nom du patient (anonymisé)', example: 'Patient 01' })
  @IsString()
  @MinLength(2, {
    message: 'Le nom du patient doit contenir au moins 2 caractères.',
  })
  namePatient!: string;

  @ApiPropertyOptional({ description: 'Âge (années)', example: 34 })
  @IsOptional()
  @IsInt()
  @Min(0)
  age?: number;

  @ApiPropertyOptional({ description: 'Sexe', example: 'M' })
  @IsOptional()
  @IsIn(['M', 'F'])
  gender?: string;
}

export class CreateAnalyseInCaseDto {
  @ApiProperty({
    description: "Libellé de l'analyse demandée",
    example: 'Test rapide paludisme',
  })
  @IsString()
  @MinLength(2, {
    message: "Le libellé de l'analyse doit contenir au moins 2 caractères.",
  })
  label!: string;

  @ApiProperty({
    description: 'Type de résultat attendu',
    enum: TypeResultatAttendu,
  })
  @IsEnum(TypeResultatAttendu, { message: 'Type de résultat invalide.' })
  typeResultatAttendu!: TypeResultatAttendu;
}

export class CreateCaseDto {
  @ApiProperty({
    description: 'Nouveau patient créé à chaque déclaration',
    type: NewPatientDto,
  })
  @IsObject({ message: 'Le nouveau patient est requis.' })
  @ValidateNested()
  @Type(() => NewPatientDto)
  newPatient!: NewPatientDto;

  @ApiProperty({
    description: 'Statut diagnostique initial',
    enum: [StatutDiag.Suspect, StatutDiag.Confirme],
    default: StatutDiag.Suspect,
  })
  @IsOptional()
  @IsIn([StatutDiag.Suspect, StatutDiag.Confirme], {
    message: 'Le statut doit être Suspect ou Confirme.',
  })
  diagnosticStatus?: StatutDiag;

  @ApiProperty({ description: 'Identifiant de la maladie', example: 1 })
  @IsInt()
  @Min(1)
  maladieId!: number;

  @ApiProperty({
    description:
      "Identifiant du centre de santé (ignoré et forcé côté serveur pour un Médecin ; requis pour un Admin)",
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  centreId?: number;

  @ApiPropertyOptional({ description: 'Symptômes observés' })
  @IsOptional()
  @IsString()
  symptoms?: string;

  @ApiPropertyOptional({
    description: 'Analyses demandées lors de la déclaration',
    type: [CreateAnalyseInCaseDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAnalyseInCaseDto)
  analyses?: CreateAnalyseInCaseDto[];
}