import { Prisma } from "../../generated/prisma/client";

const ROLES = [
  { name: "Administrateur" },
  { name: "Medecin" },
  { name: "Laboratoire" },
];

export async function seedRoles(prisma: Prisma.TransactionClient) {
  await Promise.all(
    ROLES.map((role) =>
      prisma.role.upsert({
        where: { name: role.name },
        update: {},
        create: role,
      }),
    ),
  );
}
