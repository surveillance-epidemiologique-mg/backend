import { PrismaClient } from "../../generated/prisma/client";
import { TypeCentre } from "../../generated/prisma/enums";

export async function seedCentresSante(prisma: PrismaClient) {
  const district = await prisma.zoneAdministrative.findUnique({
    where: { pcode: "MG-T1" },
  });

  if (!district) {
    throw new Error(
      "Zone 'MG-T1' introuvable. Exécutez d'abord seedZonesAdministratives.",
    );
  }

  const centre = {
    name: "CSB2 Ambohidratrimo",
    type: TypeCentre.CSB2,
    zoneId: district.id,
  };

  const existing = await prisma.centreSante.findFirst({
    where: { name: centre.name },
  });

  if (existing) {
    await prisma.centreSante.update({
      where: { id: existing.id },
      data: centre,
    });
  } else {
    await prisma.centreSante.create({ data: centre });
  }
}
