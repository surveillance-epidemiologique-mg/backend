import { Prisma } from "../../generated/prisma/client";
import {
  IssueClinique,
  StatutDiag,
} from "../../generated/prisma/enums";

interface CasSeed {
  maladieName: string;
  patientIndex: number;
  diagnosticStatus: StatutDiag;
  clinicalOutcome: IssueClinique;
  labResult?: string;
  daysAgo: number;
  symptoms?: string;
}

const CASES: CasSeed[] = [
  { maladieName: "Choléra", patientIndex: 0, diagnosticStatus: StatutDiag.Confirme, clinicalOutcome: IssueClinique.EnCours, labResult: "Vibrio cholerae +", daysAgo: 1, symptoms: "Diarrhée aiguë, déshydratation" },
  { maladieName: "Choléra", patientIndex: 1, diagnosticStatus: StatutDiag.Suspect, clinicalOutcome: IssueClinique.EnCours, daysAgo: 2, symptoms: "Diarrhée, vomissements" },
  { maladieName: "Choléra", patientIndex: 2, diagnosticStatus: StatutDiag.Confirme, clinicalOutcome: IssueClinique.Gueri, labResult: "Vibrio cholerae +", daysAgo: 8, symptoms: "Diarrhée aqueuse" },
  { maladieName: "Rougeole", patientIndex: 3, diagnosticStatus: StatutDiag.Confirme, clinicalOutcome: IssueClinique.EnCours, labResult: "IgM rougeole +", daysAgo: 1, symptoms: "Éruption maculopapuleuse, fièvre" },
  { maladieName: "Rougeole", patientIndex: 4, diagnosticStatus: StatutDiag.Suspect, clinicalOutcome: IssueClinique.EnCours, daysAgo: 3, symptoms: "Fièvre, éruption" },
  { maladieName: "Paludisme", patientIndex: 5, diagnosticStatus: StatutDiag.Confirme, clinicalOutcome: IssueClinique.Gueri, labResult: "Goutte épaisse +", daysAgo: 4, symptoms: "Fièvre, frissons" },
  { maladieName: "Paludisme", patientIndex: 6, diagnosticStatus: StatutDiag.Confirme, clinicalOutcome: IssueClinique.Deces, labResult: "Goutte épaisse +", daysAgo: 12, symptoms: "Accès palustre grave" },
  { maladieName: "Paludisme", patientIndex: 7, diagnosticStatus: StatutDiag.Suspect, clinicalOutcome: IssueClinique.EnCours, daysAgo: 1, symptoms: "Fièvre" },
  { maladieName: "Grippe", patientIndex: 8, diagnosticStatus: StatutDiag.Confirme, clinicalOutcome: IssueClinique.Gueri, labResult: "PCR grippe A +", daysAgo: 6, symptoms: "Fièvre, toux, courbatures" },
  { maladieName: "Grippe", patientIndex: 9, diagnosticStatus: StatutDiag.Suspect, clinicalOutcome: IssueClinique.EnCours, daysAgo: 2, symptoms: "Toux, fièvre" },
  { maladieName: "Mpox", patientIndex: 10, diagnosticStatus: StatutDiag.Confirme, clinicalOutcome: IssueClinique.EnCours, labResult: "PCR Mpox +", daysAgo: 3, symptoms: "Lésions cutanées, fièvre" },
  { maladieName: "Tuberculose", patientIndex: 11, diagnosticStatus: StatutDiag.Confirme, clinicalOutcome: IssueClinique.EnCours, labResult: "BAAR +", daysAgo: 5, symptoms: "Toux chronique, amaigrissement" },
  { maladieName: "La peste", patientIndex: 12, diagnosticStatus: StatutDiag.Confirme, clinicalOutcome: IssueClinique.Gueri, labResult: "Culture +", daysAgo: 10, symptoms: "Adénopathie, fièvre" },
  { maladieName: "La dengue", patientIndex: 13, diagnosticStatus: StatutDiag.Suspect, clinicalOutcome: IssueClinique.EnCours, daysAgo: 1, symptoms: "Fièvre, douleurs articulaires" },
  { maladieName: "Le virus Ebola", patientIndex: 0, diagnosticStatus: StatutDiag.Invalide, clinicalOutcome: IssueClinique.Gueri, labResult: "PCR négative", daysAgo: 9, symptoms: "Fièvre, hémorragies" },
];

export async function seedCasEpidemiologiques(
  prisma: Prisma.TransactionClient,
) {
  const admin = await prisma.utilisateur.findFirst({
    orderBy: { id: "asc" },
  });
  const centres = await prisma.centreSante.findMany({
    orderBy: { id: "asc" },
  });
  const patients = await prisma.patient.findMany({
    orderBy: { anonymousCode: "asc" },
  });
  const maladies = await prisma.maladie.findMany();

  if (!admin || centres.length === 0 || patients.length === 0) {
    throw new Error(
      "Seed cas épidémiologiques : utilisateur, centres ou patients manquants.",
    );
  }

  const existing = await prisma.casEpidemiologique.count();
  if (existing > 0) {
    return;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 0; i < CASES.length; i++) {
    const cas = CASES[i];
    const maladie = maladies.find((m) => m.name === cas.maladieName);
    if (!maladie) {
      continue;
    }
    const patient = patients[cas.patientIndex % patients.length];
    const centre = centres[i % centres.length];
    const diagnosisDate = new Date(today);
    diagnosisDate.setDate(diagnosisDate.getDate() - cas.daysAgo);

    const declarationDate = new Date(diagnosisDate);
    declarationDate.setHours(8 + (i % 8), 15, 0, 0);

    await prisma.casEpidemiologique.create({
      data: {
        patientId: patient.id,
        maladieId: maladie.id,
        centreId: centre.id,
        agentId: admin.id,
        diagnosticStatus: cas.diagnosticStatus,
        clinicalOutcome: cas.clinicalOutcome,
        labResult: cas.labResult,
        diagnosisDate,
        declarationDate,
        symptoms: cas.symptoms,
      },
    });
  }
}