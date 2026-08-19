import { PrismaClient } from "../../generated/prisma/client";

const ADMIN_NAME = process.env.ADMIN_NAME;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

export async function seedUtilisateurs(prisma: PrismaClient) {
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD_HASH) {
    throw new Error(
      "Variables ADMIN_NAME, ADMIN_EMAIL et ADMIN_PASSWORD_HASH manquantes dans le fichier .env",
    );
  }

  const adminRole = await prisma.role.findUnique({
    where: { name: "Administrateur" },
  });

  if (!adminRole) {
    throw new Error(
      "Role 'Administrateur' introuvable. Exécutez d'abord seedRoles.",
    );
  }

  await prisma.utilisateur.upsert({
    where: {
      email: ADMIN_EMAIL,
    },
    update: {
      name: ADMIN_NAME,
      roleId: adminRole.id,
    },
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash: ADMIN_PASSWORD_HASH,
      roleId: adminRole.id,
    },
  });
}