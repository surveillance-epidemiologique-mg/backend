import { SetMetadata } from '@nestjs/common';

/**
 * Autorise le rôle Laboratoire sur un endpoint normalement réservé au
 * parcours Médecin lorsque LABO_PEUT_DECLARER_CAS=true.
 */
export const LAB_CASE_ACCESS_KEY = 'labCaseAccess';
export const AllowLaboratoryCaseAccess = () =>
  SetMetadata(LAB_CASE_ACCESS_KEY, true);
