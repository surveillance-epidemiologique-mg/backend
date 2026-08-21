import { SetMetadata } from '@nestjs/common';

export const TEMP_PASSWORD_ALLOWED_KEY = 'tempPasswordAllowed';
export const TempPasswordAllowed = () =>
  SetMetadata(TEMP_PASSWORD_ALLOWED_KEY, true);
