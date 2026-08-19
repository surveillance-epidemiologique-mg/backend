import { PrismaClient } from "../../generated/prisma/client";

const ADMIN_PASSWORD_HASH = "REMPLACEZ_PAR_UN_HASH_BCRYPT";

export async function seedUtilisateurs(prisma: PrismaClient) {
  const adminRole = await prisma.role.findUnique({
    where: { name: "Administrateur" },
  });

  if (!adminRole) {
    throw new Error(
      "Role 'Administrateur' introuvable. Exécutez d'abord seedRoles.",
    );
  }

  await prisma.utilisateur.upsert({
    where: { email: "admin@surveillance.mg" },
    update: { roleId: adminRole.id },
    create: {
      name: "Administrateur",
      email: "admin@surveillance.mg",
      passwordHash: ADMIN_PASSWORD_HASH,
      roleId: adminRole.id,
    },
  });
}
