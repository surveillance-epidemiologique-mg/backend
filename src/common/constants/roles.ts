export const ROLES = {
  ADMINISTRATEUR: 'Administrateur',
  RESPONSABLE_NATIONAL: 'Responsable national',
  RESPONSABLE_REGIONAL: 'Responsable régional',
  AGENT_SANTE: 'Agent de santé',
  OBSERVATEUR: 'Observateur',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const INVITABLE_ROLES: readonly RoleName[] = [
  ROLES.RESPONSABLE_NATIONAL,
  ROLES.RESPONSABLE_REGIONAL,
  ROLES.AGENT_SANTE,
  ROLES.OBSERVATEUR,
];
