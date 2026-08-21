import { IsBoolean } from 'class-validator';

export class SetUserStatusDto {
  @IsBoolean({ message: 'Le statut doit être un booléen.' })
  isActive!: boolean;
}
