import { PrismaClient } from "../../generated/prisma/client";

const ROLES = [
  { name: "Administrateur" },
  { name: "Medecin" },
  { name: "Laboratoire" },
];

export async function seedRoles(prisma: PrismaClient) {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: {
        name: role.name,
      },
      update: {},
      create: role,
    });
  }
}