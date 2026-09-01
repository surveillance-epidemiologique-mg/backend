import { Prisma } from "../../generated/prisma/client";
import { ROLES } from "../../src/common/constants/roles";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  Administrateur:
    "Administrateur système : gestion des utilisateurs, des référentiels et des paramètres.",
  Medecin: "Médecin : déclaration des cas, suivi clinique et épidémiologique.",
  Laboratoire: "Laboratoire : analyse des cas, saisie des résultats biologiques.",
};

export async function seedRoles(prisma: Prisma.TransactionClient) {
  const roleNames = Object.values(ROLES);

  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { name },
      update: { description: ROLE_DESCRIPTIONS[name] ?? null },
      create: { name, description: ROLE_DESCRIPTIONS[name] ?? null },
    });
  }
}