export const ROLES = {
  ADMINISTRATEUR: 'Administrateur',
  MEDECIN: 'Medecin',
  LABORATOIRE: 'Laboratoire',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
