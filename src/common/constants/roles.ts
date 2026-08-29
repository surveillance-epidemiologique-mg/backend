export const ROLES = {
  ADMINISTRATEUR: 'Administrateur',
  MEDECIN: 'Medecin',
  LABORATOIRE: 'Laboratoire',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const INVITABLE_ROLES: readonly RoleName[] = [
  ROLES.MEDECIN,
  ROLES.LABORATOIRE,
];
