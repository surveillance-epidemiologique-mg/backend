import { Prisma } from "../../generated/prisma/client";
import { TypeZone } from "../../generated/prisma/enums";

export async function seedZonesAdministratives(prisma: Prisma.TransactionClient) {
  const region = await prisma.zoneAdministrative.upsert({
    where: { pcode: "MG-T" },
    update: {},
    create: {
      name: "Analamanga",
      type: TypeZone.Region,
      pcode: "MG-T",
    },
  });

  const district = await prisma.zoneAdministrative.upsert({
    where: { pcode: "MG-T1" },
    update: { parentId: region.id },
    create: {
      name: "Antananarivo Renivohitra",
      type: TypeZone.District,
      pcode: "MG-T1",
      parentId: region.id,
    },
  });

  await prisma.zoneAdministrative.upsert({
    where: { pcode: "MG-T1-01" },
    update: { parentId: district.id },
    create: {
      name: "1er Arrondissement",
      type: TypeZone.Commune,
      pcode: "MG-T1-01",
      parentId: district.id,
    },
  });
}
