import { Prisma } from '../../generated/prisma/client';

export interface MaladieSeed {
  name: string;
  icd10Code: string | null;
  alertThresholdCentre: number;
  alertThresholdRegion: number;
  description?: string;
}

// Demo thresholds only: these are not clinical or public-health recommendations.
export const MALADIES: MaladieSeed[] = [
  {
    name: 'Choléra',
    icd10Code: 'A00',
    alertThresholdCentre: 1,
    alertThresholdRegion: 4,
    description: 'Infection diarrhéique aiguë due à Vibrio cholerae',
  },
  {
    name: 'Rougeole',
    icd10Code: 'B05',
    alertThresholdCentre: 3,
    alertThresholdRegion: 8,
    description: 'Maladie virale très contagieuse',
  },
  {
    name: 'Paludisme',
    icd10Code: 'B54',
    alertThresholdCentre: 5,
    alertThresholdRegion: 15,
    description: 'Maladie parasitaire transmise par les moustiques',
  },
  {
    name: 'Grippe',
    icd10Code: 'J11',
    alertThresholdCentre: 6,
    alertThresholdRegion: 20,
    description: 'Infection respiratoire virale saisonnière',
  },
  {
    name: 'VIH/SIDA',
    icd10Code: 'B24',
    alertThresholdCentre: 2,
    alertThresholdRegion: 7,
    description: "Virus de l'immunodéficience humaine",
  },
  {
    name: 'Mpox',
    icd10Code: 'B04',
    alertThresholdCentre: 1,
    alertThresholdRegion: 3,
    description: 'Orthopoxvirose zoonotique émergente',
  },
  {
    name: 'Tuberculose',
    icd10Code: 'A15',
    alertThresholdCentre: 4,
    alertThresholdRegion: 12,
    description: 'Infection bactérienne à Mycobacterium tuberculosis',
  },
  {
    name: 'La peste',
    icd10Code: 'A20',
    alertThresholdCentre: 1,
    alertThresholdRegion: 2,
    description: 'Maladie bactérienne transmise par les puces',
  },
  {
    name: 'Le virus Ebola',
    icd10Code: 'A98.4',
    alertThresholdCentre: 1,
    alertThresholdRegion: 2,
    description: 'Fièvre hémorragique virale',
  },
  {
    name: 'La dengue',
    icd10Code: 'A90',
    alertThresholdCentre: 4,
    alertThresholdRegion: 10,
    description: 'Arbovirose transmise par les moustiques Aedes',
  },
  {
    name: 'La grippe aviaire',
    icd10Code: 'J09',
    alertThresholdCentre: 1,
    alertThresholdRegion: 3,
    description: "Infection respiratoire virale d'origine aviaire",
  },
  {
    name: 'Autres',
    icd10Code: null,
    alertThresholdCentre: 5,
    alertThresholdRegion: 8,
    description: 'Autres maladies sous surveillance',
  },
];

async function upsertMaladie(
  tx: Prisma.TransactionClient,
  maladie: MaladieSeed,
) {
  const data = { ...maladie, alertThreshold: maladie.alertThresholdRegion };
  if (maladie.icd10Code) {
    const existing = await tx.maladie.findUnique({
      where: { icd10Code: maladie.icd10Code },
    });
    if (existing) {
      return tx.maladie.update({
        where: { id: existing.id },
        data,
      });
    }
  }

  const byName = await tx.maladie.findFirst({
    where: { name: maladie.name },
  });
  if (byName) {
    return tx.maladie.update({ where: { id: byName.id }, data });
  }

  return tx.maladie.create({ data });
}

export async function seedMaladies(prisma: Prisma.TransactionClient) {
  await Promise.all(MALADIES.map((maladie) => upsertMaladie(prisma, maladie)));
}
