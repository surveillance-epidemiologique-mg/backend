import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ActivateInfoDto {
  @ApiProperty({ description: "Jeton d'activation reçu par e-mail" })
  @IsString()
  @MinLength(10, { message: 'Jeton invalide.' })
  token!: string;
}