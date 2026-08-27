import { Prisma } from "../../generated/prisma/client";

export interface MaladieSeed {
  name: string;
  icd10Code: string | null;
  iconName: string;
  alertThreshold: number;
  description?: string;
}

export const MALADIES: MaladieSeed[] = [
  {
    name: "Choléra",
    icd10Code: "A00",
    iconName: "Droplets",
    alertThreshold: 1,
    description: "Infection diarrhéique aiguë due à Vibrio cholerae",
  },
  {
    name: "Rougeole",
    icd10Code: "B05",
    iconName: "Baby",
    alertThreshold: 2,
    description: "Maladie virale très contagieuse",
  },
  {
    name: "Paludisme",
    icd10Code: "B54",
    iconName: "Bug",
    alertThreshold: 5,
    description: "Maladie parasitaire transmise par les moustiques",
  },
  {
    name: "Grippe",
    icd10Code: "J11",
    iconName: "Thermometer",
    alertThreshold: 3,
    description: "Infection respiratoire virale saisonnière",
  },
  {
    name: "VIH/SIDA",
    icd10Code: "B24",
    iconName: "ShieldAlert",
    alertThreshold: 1,
    description: "Virus de l'immunodéficience humaine",
  },
  {
    name: "Mpox",
    icd10Code: "B04",
    iconName: "Syringe",
    alertThreshold: 1,
    description: "Orthopoxvirose zoonotique émergente",
  },
  {
    name: "Tuberculose",
    icd10Code: "A15",
    iconName: "Stethoscope",
    alertThreshold: 2,
    description: "Infection bactérienne à Mycobacterium tuberculosis",
  },
  {
    name: "La peste",
    icd10Code: "A20",
    iconName: "Skull",
    alertThreshold: 1,
    description: "Maladie bactérienne transmise par les puces",
  },
  {
    name: "Le virus Ebola",
    icd10Code: "A98.4",
    iconName: "Radiation",
    alertThreshold: 1,
    description: "Fièvre hémorragique virale",
  },
  {
    name: "La dengue",
    icd10Code: "A90",
    iconName: "BugOff",
    alertThreshold: 4,
    description: "Arbovirose transmise par les moustiques Aedes",
  },
  {
    name: "La grippe aviaire",
    icd10Code: "J09",
    iconName: "Bird",
    alertThreshold: 1,
    description: "Infection respiratoire virale d'origine aviaire",
  },
  {
    name: "Autres",
    icd10Code: null,
    iconName: "Activity",
    alertThreshold: 1,
    description: "Autres maladies sous surveillance",
  },
];

async function upsertMaladie(
  tx: Prisma.TransactionClient,
  maladie: MaladieSeed,
) {
  if (maladie.icd10Code) {
    const existing = await tx.maladie.findUnique({
      where: { icd10Code: maladie.icd10Code },
    });
    if (existing) {
      return tx.maladie.update({
        where: { id: existing.id },
        data: maladie,
      });
    }
  }

  const byName = await tx.maladie.findFirst({
    where: { name: maladie.name },
  });
  if (byName) {
    return tx.maladie.update({ where: { id: byName.id }, data: maladie });
  }

  return tx.maladie.create({ data: maladie });
}

export async function seedMaladies(prisma: Prisma.TransactionClient) {
  await Promise.all(MALADIES.map((maladie) => upsertMaladie(prisma, maladie)));
}