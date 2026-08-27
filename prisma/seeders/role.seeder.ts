import { Prisma } from "../../generated/prisma/client";
import { ROLES } from "../../src/common/constants/roles";
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
} from "../../src/common/constants/permissions";

export async function seedRoles(prisma: Prisma.TransactionClient) {
  const roleNames = Object.values(ROLES);

  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: code },
      create: { code, description: code },
    });
  }

  await prisma.rolePermission.deleteMany();

  for (const [roleName, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      continue;
    }
    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...codes] } },
    });
    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      });
    }
  }
}