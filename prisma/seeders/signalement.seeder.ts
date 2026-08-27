import { Prisma } from "../../generated/prisma/client";
import { StatutSignalement } from "../../generated/prisma/enums";

interface SignalementSeed {
  maladieName: string;
  centreName: string;
  statut: StatutSignalement;
  nbCasSuspects: number;
  nbCasConfirmes: number;
  nbDeces: number;
  nbGueris: number;
  daysAgo: number;
  decided?: boolean;
}

const SIGNALEMENTS: SignalementSeed[] = [
  {
    maladieName: "Choléra",
    centreName: "CSB2 Ambohidratrimo",
    statut: StatutSignalement.Brouillon,
    nbCasSuspects: 4,
    nbCasConfirmes: 1,
    nbDeces: 0,
    nbGueris: 0,
    daysAgo: 1,
  },
  {
    maladieName: "Rougeole",
    centreName: "CSB2 Ambohidratrimo",
    statut: StatutSignalement.EnAttente,
    nbCasSuspects: 3,
    nbCasConfirmes: 2,
    nbDeces: 0,
    nbGueris: 1,
    daysAgo: 2,
  },
  {
    maladieName: "Paludisme",
    centreName: "CSB2 Ambohidratrimo",
    statut: StatutSignalement.Valide,
    nbCasSuspects: 5,
    nbCasConfirmes: 3,
    nbDeces: 1,
    nbGueris: 2,
    daysAgo: 4,
    decided: true,
  },
  {
    maladieName: "Grippe",
    centreName: "CHRD Toamasina",
    statut: StatutSignalement.EnAttente,
    nbCasSuspects: 6,
    nbCasConfirmes: 2,
    nbDeces: 0,
    nbGueris: 3,
    daysAgo: 3,
  },
  {
    maladieName: "La dengue",
    centreName: "CHRD Toamasina",
    statut: StatutSignalement.Rejete,
    nbCasSuspects: 8,
    nbCasConfirmes: 0,
    nbDeces: 0,
    nbGueris: 0,
    daysAgo: 5,
    decided: true,
  },
  {
    maladieName: "Tuberculose",
    centreName: "CHRD Toamasina",
    statut: StatutSignalement.Brouillon,
    nbCasSuspects: 2,
    nbCasConfirmes: 1,
    nbDeces: 0,
    nbGueris: 0,
    daysAgo: 1,
  },
];

export async function seedSignalements(prisma: Prisma.TransactionClient) {
  const existing = await prisma.signalement.count();
  if (existing > 0) {
    return;
  }

  const admin = await prisma.utilisateur.findFirst({
    orderBy: { id: "asc" },
  });
  const maladies = await prisma.maladie.findMany();
  const centres = await prisma.centreSante.findMany({
    include: { zone: { include: { parent: true } } },
  });

  if (!admin || !maladies.length || !centres.length) {
    throw new Error(
      "Seed signalements : utilisateur, maladies ou centres manquants.",
    );
  }

  const now = new Date();

  for (const seed of SIGNALEMENTS) {
    const maladie = maladies.find((m) => m.name === seed.maladieName);
    const centre = centres.find((c) => c.name === seed.centreName);
    if (!maladie || !centre) {
      continue;
    }

    const region = centre.zone.parent;
    if (!region) {
      continue;
    }

    const dateSignalement = new Date(now);
    dateSignalement.setDate(dateSignalement.getDate() - seed.daysAgo);

    await prisma.signalement.create({
      data: {
        maladieId: maladie.id,
        regionId: region.id,
        districtId: centre.zoneId,
        centreId: centre.id,
        dateSignalement,
        nbCasSuspects: seed.nbCasSuspects,
        nbCasConfirmes: seed.nbCasConfirmes,
        nbDeces: seed.nbDeces,
        nbGueris: seed.nbGueris,
        statut: seed.statut,
        createdById: admin.id,
        decidedById: seed.decided ? admin.id : null,
        decidedAt: seed.decided ? new Date(now) : null,
      },
    });
  }
}