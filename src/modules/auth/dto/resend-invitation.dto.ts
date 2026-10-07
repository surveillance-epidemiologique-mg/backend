import { IsString } from 'class-validator';

export class ResendInvitationDto {
  @IsString()
  token!: string;
}
