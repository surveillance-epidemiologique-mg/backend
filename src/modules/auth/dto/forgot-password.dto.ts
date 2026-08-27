import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Adresse e-mail du compte concerné',
    example: 'medecin@example.com',
  })
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @IsNotEmpty({ message: "L'adresse e-mail est requise." })
  email!: string;
}
