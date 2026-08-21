import * as bcrypt from "bcryptjs";
import { Prisma } from "../../generated/prisma/client";

const ADMIN_NAME = process.env.ADMIN_NAME;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10);

export async function seedUtilisateurs(prisma: Prisma.TransactionClient) {
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Variables ADMIN_NAME, ADMIN_EMAIL et ADMIN_PASSWORD manquantes dans le fichier .env",
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

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

  await prisma.utilisateur.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: ADMIN_NAME,
      passwordHash,
      roleId: adminRole.id,
      temporaryPassword: false,
    },
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      roleId: adminRole.id,
      temporaryPassword: false,
    },
  });
}
