import { Prisma } from "../../generated/prisma/client";

const MALADIES = [
  {
    name: "Peste",
    icd10Code: "A20",
    alertThreshold: 1,
    description: "Maladie bactérienne transmise par les puces",
  },
  {
    name: "Paludisme",
    icd10Code: "B54",
    alertThreshold: 5,
    description: "Maladie parasitaire transmise par les moustiques",
  },
  {
    name: "Rougeole",
    icd10Code: "B05",
    alertThreshold: 2,
    description: "Maladie virale très contagieuse",
  },
  {
    name: "COVID-19",
    icd10Code: "U07.1",
    alertThreshold: 3,
    description: "Infection respiratoire due au SARS-CoV-2",
  },
];

export async function seedMaladies(prisma: Prisma.TransactionClient) {
  await Promise.all(
    MALADIES.map((maladie) =>
      prisma.maladie.upsert({
        where: { icd10Code: maladie.icd10Code },
        update: {
          name: maladie.name,
          alertThreshold: maladie.alertThreshold,
          description: maladie.description,
        },
        create: maladie,
      }),
    ),
  );
}
