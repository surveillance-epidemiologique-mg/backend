import { Prisma } from "../../generated/prisma/client";
import { Gravite, StatutAlerte } from "../../generated/prisma/enums";

interface CarteRegionAlerteSeed {
  maladieName: string;
  districtPcode: string;
  niveauGravite: Gravite;
  detectedCaseCount: number;
  daysAgo: number;
}

/**
 * Alertes actives réparties sur les districts disponibles pour colorer
 * la choroplèthe ADM1 (High / Moderate / Low / Very low).
 *
 * Région cible ← district (pcode) :
 *   Critique → rouge · Élevé → orange · Modéré → jaune · Faible → vert
 */
const CARTE_REGION_ALERTES: CarteRegionAlerteSeed[] = [
  { maladieName: "La peste", districtPcode: "MG-D1", niveauGravite: Gravite.Critique, detectedCaseCount: 4, daysAgo: 1 },
  { maladieName: "Choléra", districtPcode: "MG-T1", niveauGravite: Gravite.Eleve, detectedCaseCount: 3, daysAgo: 2 },
  { maladieName: "Rougeole", districtPcode: "MG-VK1", niveauGravite: Gravite.Modere, detectedCaseCount: 2, daysAgo: 3 },
  { maladieName: "La dengue", districtPcode: "MG-B1", niveauGravite: Gravite.Faible, detectedCaseCount: 1, daysAgo: 4 },
  { maladieName: "Paludisme", districtPcode: "MG-A1", niveauGravite: Gravite.Critique, detectedCaseCount: 6, daysAgo: 1 },
  { maladieName: "Tuberculose", districtPcode: "MG-SV1", niveauGravite: Gravite.Eleve, detectedCaseCount: 3, daysAgo: 2 },
  { maladieName: "Grippe", districtPcode: "MG-HM1", niveauGravite: Gravite.Modere, detectedCaseCount: 2, daysAgo: 5 },
  { maladieName: "Mpox", districtPcode: "MG-AT1", niveauGravite: Gravite.Faible, detectedCaseCount: 1, daysAgo: 6 },
  { maladieName: "La grippe aviaire", districtPcode: "MG-AN1", niveauGravite: Gravite.Critique, detectedCaseCount: 5, daysAgo: 2 },
  { maladieName: "Choléra", districtPcode: "MG-MN1", niveauGravite: Gravite.Eleve, detectedCaseCount: 4, daysAgo: 3 },
  { maladieName: "Paludisme", districtPcode: "MG-AA1", niveauGravite: Gravite.Modere, detectedCaseCount: 3, daysAgo: 4 },
  { maladieName: "Rougeole", districtPcode: "MG-BG1", niveauGravite: Gravite.Faible, detectedCaseCount: 2, daysAgo: 7 },
];

async function setEmpriseSpatiale(
  prisma: Prisma.TransactionClient,
  alerteId: number,
  zoneId: number,
) {
  const centre = await prisma.centreSante.findFirst({
    where: { zoneId },
  });
  if (centre?.latitude == null || centre?.longitude == null) {
    return;
  }

  await prisma.$executeRaw`
    UPDATE alertes
    SET emprise_spatiale = ST_Buffer(
      ST_SetSRID(ST_MakePoint(${centre.longitude}, ${centre.latitude}), 4326)::geography,
      20000
    )::geometry
    WHERE id_alerte = ${alerteId}
  `;
}

export async function seedAlertesCarteRegions(prisma: Prisma.TransactionClient) {
  const maladies = await prisma.maladie.findMany();
  const zones = await prisma.zoneAdministrative.findMany();

  for (const alerte of CARTE_REGION_ALERTES) {
    const maladie = maladies.find((m) => m.name === alerte.maladieName);
    const zone = zones.find((z) => z.pcode === alerte.districtPcode);
    if (!maladie || !zone) {
      continue;
    }

    const dateDetection = new Date();
    dateDetection.setDate(dateDetection.getDate() - alerte.daysAgo);

    const existing = await prisma.alerte.findFirst({
      where: { maladieId: maladie.id, zoneId: zone.id },
    });

    const saved = existing
      ? await prisma.alerte.update({
          where: { id: existing.id },
          data: {
            detectionDate: dateDetection,
            niveauGravite: alerte.niveauGravite,
            statutAlerte: StatutAlerte.Active,
            detectedCaseCount: alerte.detectedCaseCount,
          },
        })
      : await prisma.alerte.create({
          data: {
            maladieId: maladie.id,
            zoneId: zone.id,
            detectionDate: dateDetection,
            niveauGravite: alerte.niveauGravite,
            statutAlerte: StatutAlerte.Active,
            detectedCaseCount: alerte.detectedCaseCount,
          },
        });

    await setEmpriseSpatiale(prisma, saved.id, zone.id);
  }
}
