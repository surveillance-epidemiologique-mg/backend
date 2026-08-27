import { Prisma } from "../../generated/prisma/client";
import { NiveauRisque } from "../../generated/prisma/enums";

interface RegleAlerteSeed {
  name: string;
  description: string;
  maladieName: string | null;
  districtPcode: string;
  periodDays: number;
  threshold: number;
  niveau: NiveauRisque;
}

const REGLES: RegleAlerteSeed[] = [
  {
    name: "Choléra - seuil 1 cas / 7 jours",
    description: "Alerte déclenchée dès 1 cas de choléra détecté sur 7 jours.",
    maladieName: "Choléra",
    districtPcode: "MG-T1",
    periodDays: 7,
    threshold: 1,
    niveau: NiveauRisque.Alerte,
  },
  {
    name: "Rougeole - seuil 1 cas / 7 jours",
    description: "Surveillance renforcée dès 1 cas de rougeole sur 7 jours.",
    maladieName: "Rougeole",
    districtPcode: "MG-T1",
    periodDays: 7,
    threshold: 1,
    niveau: NiveauRisque.Surveillance,
  },
  {
    name: "Paludisme - seuil 2 cas / 7 jours",
    description: "Situation critique dès 2 cas de paludisme sur 7 jours à Toamasina.",
    maladieName: "Paludisme",
    districtPcode: "MG-A1",
    periodDays: 7,
    threshold: 2,
    niveau: NiveauRisque.Critique,
  },
  {
    name: "Grippe - seuil 1 cas / 7 jours",
    description: "Alerte grippe dès 1 cas sur 7 jours à Toamasina.",
    maladieName: "Grippe",
    districtPcode: "MG-A1",
    periodDays: 7,
    threshold: 1,
    niveau: NiveauRisque.Alerte,
  },
  {
    name: "Dengue - seuil 1 cas / 7 jours",
    description: "Surveillance dengue dès 1 cas sur 7 jours à Toamasina.",
    maladieName: "La dengue",
    districtPcode: "MG-A1",
    periodDays: 7,
    threshold: 1,
    niveau: NiveauRisque.Surveillance,
  },
  {
    name: "Peste - seuil 1 cas / 7 jours",
    description: "Situation critique dès 1 cas de peste sur 7 jours.",
    maladieName: "La peste",
    districtPcode: "MG-T1",
    periodDays: 7,
    threshold: 1,
    niveau: NiveauRisque.Critique,
  },
];

export async function seedReglesAlerte(prisma: Prisma.TransactionClient) {
  const existing = await prisma.regleAlerte.count();
  if (existing > 0) {
    return;
  }

  const maladies = await prisma.maladie.findMany();
  const zones = await prisma.zoneAdministrative.findMany({
    where: { pcode: { in: ["MG-T1", "MG-A1"] } },
  });

  if (!zones.length) {
    throw new Error("Seed règles d'alerte : zones administratives manquantes.");
  }

  for (const regle of REGLES) {
    const zone = zones.find((z) => z.pcode === regle.districtPcode);
    if (!zone) {
      continue;
    }
    const maladie = regle.maladieName
      ? maladies.find((m) => m.name === regle.maladieName)
      : null;

    await prisma.regleAlerte.create({
      data: {
        name: regle.name,
        description: regle.description,
        maladieId: maladie?.id ?? null,
        zoneId: zone.id,
        periodDays: regle.periodDays,
        threshold: regle.threshold,
        niveau: regle.niveau,
      },
    });
  }
}