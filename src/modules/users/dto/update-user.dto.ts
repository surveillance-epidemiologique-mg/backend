import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  name?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsInt({ message: 'Le rôle doit être un identifiant entier.' })
  @Min(1)
  roleId?: number;

  @IsOptional()
  @IsInt({ message: 'Le centre de santé doit être un identifiant entier.' })
  @Min(1)
  centreId?: number | null;

  @IsOptional()
  @IsBoolean({ message: 'Le statut doit être un booléen.' })
  isActive?: boolean;
}
