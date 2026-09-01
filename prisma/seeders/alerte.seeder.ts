import { Prisma } from "../../generated/prisma/client";
import { Gravite, StatutAlerte } from "../../generated/prisma/enums";

interface AlerteSeed {
  maladieName: string;
  districtPcode: string;
  niveauGravite: Gravite;
  statutAlerte: StatutAlerte;
  detectedCaseCount: number;
  daysAgo: number;
}

const ALERTES: AlerteSeed[] = [
  { maladieName: "Choléra", districtPcode: "MG-T1", niveauGravite: Gravite.Eleve, statutAlerte: StatutAlerte.Active, detectedCaseCount: 3, daysAgo: 1 },
  { maladieName: "Rougeole", districtPcode: "MG-A1", niveauGravite: Gravite.Modere, statutAlerte: StatutAlerte.EnInvestigation, detectedCaseCount: 2, daysAgo: 2 },
  { maladieName: "Paludisme", districtPcode: "MG-A1", niveauGravite: Gravite.Critique, statutAlerte: StatutAlerte.Active, detectedCaseCount: 5, daysAgo: 3 },
  { maladieName: "La dengue", districtPcode: "MG-A1", niveauGravite: Gravite.Faible, statutAlerte: StatutAlerte.Cloturee, detectedCaseCount: 1, daysAgo: 6 },
];

export async function seedAlertes(prisma: Prisma.TransactionClient) {
  const existing = await prisma.alerte.count();
  if (existing > 0) {
    return;
  }

  const maladies = await prisma.maladie.findMany();
  const zones = await prisma.zoneAdministrative.findMany();

  for (const alerte of ALERTES) {
    const maladie = maladies.find((m) => m.name === alerte.maladieName);
    const zone = zones.find((z) => z.pcode === alerte.districtPcode);
    if (!maladie || !zone) {
      continue;
    }

    const dateDetection = new Date();
    dateDetection.setDate(dateDetection.getDate() - alerte.daysAgo);

    const created = await prisma.alerte.create({
      data: {
        maladieId: maladie.id,
        zoneId: zone.id,
        detectionDate: dateDetection,
        niveauGravite: alerte.niveauGravite,
        statutAlerte: alerte.statutAlerte,
        detectedCaseCount: alerte.detectedCaseCount,
      },
    });

    const centre = await prisma.centreSante.findFirst({
      where: { zoneId: zone.id },
    });
    if (centre?.latitude != null && centre?.longitude != null) {
      await prisma.$executeRaw`
        UPDATE alertes
        SET emprise_spatiale = ST_Buffer(
          ST_SetSRID(ST_MakePoint(${centre.longitude}, ${centre.latitude}), 4326)::geography,
          20000
        )::geometry
        WHERE id_alerte = ${created.id}
      `;
    }
  }
}