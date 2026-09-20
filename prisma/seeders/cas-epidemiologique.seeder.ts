import {
  Prisma,
  IssueClinique,
  StatutAnalyse,
  StatutDiag,
  TypeResultatAttendu,
} from '../../generated/prisma/client';
import { demoMedecinEmail } from './utilisateur.seeder';

// Stable keys independent of auto-increment IDs and the date of execution.
export const DEMO_GROUPS = [
  {
    key: 'centre-only',
    centre: 'CHRR Antsirabe',
    disease: 'Rougeole',
    count: 4,
  },
  { key: 'region-a', centre: 'CHRD Toamasina', disease: 'Choléra', count: 6 },
  { key: 'region-b', centre: 'CSB2 Toamasina', disease: 'Choléra', count: 6 },
  {
    key: 'modere',
    centre: 'CHU Androva Mahajanga',
    disease: 'La dengue',
    count: 15,
  },
  {
    key: 'eleve',
    centre: 'CHRR Fianarantsoa',
    disease: 'Tuberculose',
    count: 24,
  },
  { key: 'faible', centre: 'CHRR Antsiranana', disease: 'Mpox', count: 3 },
  // Independent regional trigger: 4 + 4 cases across two districts, both centres < 5.
  {
    key: 'zone-only-a',
    centre: 'CHU Joseph Ravoahangy Andrianavalona',
    disease: 'Autres',
    count: 4,
  },
  {
    key: 'zone-only-b',
    centre: 'CSB2 Ambohidratrimo',
    disease: 'Autres',
    count: 4,
  },
  {
    key: 'suspect',
    centre: 'CHRD Toamasina',
    disease: 'Rougeole',
    count: 2,
    status: StatutDiag.Suspect,
  },
  {
    key: 'probable',
    centre: 'CSB2 Ambohidratrimo',
    disease: 'Rougeole',
    count: 1,
    status: StatutDiag.Probable,
  },
  {
    key: 'invalide',
    centre: 'CHU Androva Mahajanga',
    disease: 'Choléra',
    count: 1,
    status: StatutDiag.Invalide,
  },
  {
    key: 'old',
    centre: 'CHRR Antsirabe',
    disease: 'Rougeole',
    count: 5,
    daysAgo: 30,
  },
];

export async function seedCasEpidemiologiques(tx: Prisma.TransactionClient) {
  const now = new Date();
  const labs = await Promise.all(
    [1, 2, 3].map((i) =>
      tx.utilisateur.findUniqueOrThrow({
        where: { email: `labo${i}@demo.surveillance.test` },
      }),
    ),
  );
  for (const group of DEMO_GROUPS) {
    const centre = await tx.centreSante.findFirstOrThrow({
      where: { name: group.centre },
    });
    const disease = await tx.maladie.findFirstOrThrow({
      where: { name: group.disease },
    });
    const doctor = await tx.utilisateur.findUniqueOrThrow({
      where: { email: demoMedecinEmail(centre.name) },
    });
    for (let index = 0; index < group.count; index++) {
      const anonymousCode = `DEMO-DUAL-${group.key}-${index + 1}`;
      const patientData = {
        namePatient: `Patient démo ${group.key} ${index + 1}`,
        age: 10 + index * 2,
        gender: index % 2 ? 'F' : 'M',
        residenceZoneId: centre.zoneId,
      };
      const patient = await tx.patient.upsert({
        where: { anonymousCode },
        create: { anonymousCode, ...patientData },
        update: patientData,
      });
      const diagnosisDate = new Date(
        now.getTime() - (group.daysAgo ?? 1) * 86400000,
      );
      const diagnosticStatus = group.status ?? StatutDiag.Confirme;
      const completed =
        diagnosticStatus === StatutDiag.Confirme ||
        diagnosticStatus === StatutDiag.Invalide;
      const data = {
        patientId: patient.id,
        maladieId: disease.id,
        centreId: centre.id,
        agentId: doctor.id,
        diagnosticStatus,
        clinicalOutcome: IssueClinique.EnCours,
        diagnosisDate,
        declarationDate: diagnosisDate,
        latitude: centre.latitude,
        longitude: centre.longitude,
        symptoms:
          'Données fictives pour la validation des alertes à deux échelles.',
      };
      const previous = await tx.casEpidemiologique.findFirst({
        where: { patientId: patient.id, maladieId: disease.id },
      });
      const saved = previous
        ? await tx.casEpidemiologique.update({
            where: { id: previous.id },
            data,
          })
        : await tx.casEpidemiologique.create({ data });
      let decisionId: number | null = null;
      for (let analysisIndex = 0; analysisIndex < 3; analysisIndex++) {
        const label = `DEMO — ${['Dépistage', 'Confirmation', 'Contrôle complémentaire'][analysisIndex]}`;
        const realised = completed && analysisIndex < 2;
        const analysisData = {
          casId: saved.id,
          label,
          resultType: TypeResultatAttendu.TexteLibre,
          resultat: realised
            ? diagnosticStatus === StatutDiag.Invalide
              ? 'Négatif'
              : 'Positif'
            : null,
          statut: realised ? StatutAnalyse.Realisee : StatutAnalyse.Demandee,
          laboratoryId: realised
            ? labs[(index + analysisIndex) % labs.length].id
            : null,
          dateDemande: diagnosisDate,
          dateAnalyse: realised
            ? new Date(diagnosisDate.getTime() + 3600000)
            : null,
        };
        const existingAnalysis = await tx.analyse.findFirst({
          where: { casId: saved.id, label },
        });
        const analysis = existingAnalysis
          ? await tx.analyse.update({
              where: { id: existingAnalysis.id },
              data: analysisData,
            })
          : await tx.analyse.create({ data: analysisData });
        if (realised && analysisIndex === 1) decisionId = analysis.id;
      }
      await tx.casEpidemiologique.update({
        where: { id: saved.id },
        data: { decisionAnalyseId: decisionId },
      });
      await tx.$executeRaw`UPDATE cas_epidemiologiques SET localisation_cas = (
        SELECT localisation FROM centres_sante WHERE id_centre = ${centre.id}
      ) WHERE id_cas = ${saved.id}`;
    }
  }
}
