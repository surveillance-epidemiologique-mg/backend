import {
  Gravite,
  Prisma,
  StatutAlerte,
  StatutDiag,
} from '../../../generated/prisma/client';

interface DiseaseThresholds {
  id: number;
  alertThresholdCentre: number;
  alertThresholdRegion: number;
}
interface Zone {
  id: number;
  parentId: number | null;
}
interface Centre {
  id: number;
  zoneId: number;
}
interface CaseCount {
  centreId: number;
  maladieId: number;
  count: number;
}
export interface AlertCandidate {
  centreId: number | null;
  zoneId: number;
  maladieId: number;
  detectedCaseCount: number;
  niveauGravite: Gravite;
}

export function computeNiveau(count: number, threshold: number): Gravite {
  const ratio = count / Math.max(threshold, 1);
  if (ratio >= 3) return Gravite.Critique;
  if (ratio >= 2) return Gravite.Eleve;
  if (ratio >= 1.5) return Gravite.Modere;
  return Gravite.Faible;
}

export function alertKey(a: {
  centreId: number | null;
  zoneId: number;
  maladieId: number;
}) {
  return `${a.centreId == null ? `zone:${a.zoneId}` : `centre:${a.centreId}`}:${a.maladieId}`;
}

/** Each confirmed case contributes once to its centre and once to each ancestor.
 * This also supports centres attached directly to a region or to a commune. */
export function buildAlertCandidates(
  diseases: DiseaseThresholds[],
  centres: Centre[],
  zones: Zone[],
  counts: CaseCount[],
): AlertCandidate[] {
  const diseaseById = new Map(diseases.map((d) => [d.id, d]));
  const centreById = new Map(centres.map((c) => [c.id, c]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const zoneCounts = new Map<
    string,
    { zoneId: number; maladieId: number; count: number }
  >();
  const candidates: AlertCandidate[] = [];
  for (const row of counts) {
    const centre = centreById.get(row.centreId);
    const disease = diseaseById.get(row.maladieId);
    if (!centre || !disease) continue;
    if (row.count >= disease.alertThresholdCentre) {
      candidates.push({
        centreId: centre.id,
        zoneId: centre.zoneId,
        maladieId: disease.id,
        detectedCaseCount: row.count,
        niveauGravite: computeNiveau(row.count, disease.alertThresholdCentre),
      });
    }
    let zone = zoneById.get(centre.zoneId);
    const visited = new Set<number>();
    while (zone && !visited.has(zone.id)) {
      visited.add(zone.id);
      const key = `${zone.id}:${disease.id}`;
      const aggregate = zoneCounts.get(key) ?? {
        zoneId: zone.id,
        maladieId: disease.id,
        count: 0,
      };
      aggregate.count += row.count;
      zoneCounts.set(key, aggregate);
      zone = zone.parentId == null ? undefined : zoneById.get(zone.parentId);
    }
  }
  for (const row of zoneCounts.values()) {
    const threshold = diseaseById.get(row.maladieId)!.alertThresholdRegion;
    if (row.count >= threshold)
      candidates.push({
        centreId: null,
        zoneId: row.zoneId,
        maladieId: row.maladieId,
        detectedCaseCount: row.count,
        niveauGravite: computeNiveau(row.count, threshold),
      });
  }
  return candidates;
}

export function alertWindowDays(): number {
  const days = Number(process.env.ALERTE_WINDOW_DAYS ?? 7);
  if (!Number.isInteger(days) || days < 1)
    throw new Error('ALERTE_WINDOW_DAYS doit être un entier positif.');
  return days;
}

/** Caller supplies a transaction. The same advisory lock serializes the seed,
 * scheduled jobs and manual detections across all application instances. */
export async function syncAlerts(
  tx: Prisma.TransactionClient,
  windowDays = alertWindowDays(),
  now = new Date(),
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260920, 1)`;
  const cutoff = new Date(now.getTime() - windowDays * 86400000);
  const [diseases, centres, zones, groups, existing] = await Promise.all([
    tx.maladie.findMany(),
    tx.centreSante.findMany({ select: { id: true, zoneId: true } }),
    tx.zoneAdministrative.findMany({ select: { id: true, parentId: true } }),
    tx.casEpidemiologique.groupBy({
      by: ['centreId', 'maladieId'],
      where: {
        diagnosticStatus: StatutDiag.Confirme,
        diagnosisDate: { gte: cutoff, lte: now },
      },
      _count: { _all: true },
    }),
    tx.alerte.findMany({
      where: {
        statutAlerte: {
          in: [StatutAlerte.Active, StatutAlerte.EnInvestigation],
        },
      },
    }),
  ]);
  const candidates = buildAlertCandidates(
    diseases,
    centres,
    zones,
    groups.map((g) => ({
      centreId: g.centreId,
      maladieId: g.maladieId,
      count: g._count._all,
    })),
  );
  const wanted = new Map(candidates.map((a) => [alertKey(a), a]));
  const current = new Map(existing.map((a) => [alertKey(a), a]));
  let created = 0,
    updated = 0,
    closed = 0;
  for (const alerte of existing) {
    if (!wanted.has(alertKey(alerte))) {
      await tx.alerte.update({
        where: { id: alerte.id },
        data: { statutAlerte: StatutAlerte.Cloturee },
      });
      closed++;
    }
  }
  for (const candidate of candidates) {
    const previous = current.get(alertKey(candidate));
    const saved = previous
      ? await tx.alerte.update({ where: { id: previous.id }, data: candidate })
      : await tx.alerte.create({
          data: {
            ...candidate,
            detectionDate: now,
            statutAlerte: StatutAlerte.Active,
          },
        });
    if (previous) updated++;
    else created++;
    if (candidate.centreId != null) {
      await tx.$executeRaw`
        UPDATE alertes SET emprise_spatiale = (
          SELECT ST_Multi(ST_Buffer(COALESCE(localisation,
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326))::geography, 500)::geometry)
          FROM centres_sante WHERE id_centre = ${candidate.centreId}
        ) WHERE id_alerte = ${saved.id}`;
    } else {
      // Never invent an administrative boundary from the locations of hospitals.
      // Districts without geometry remain in the list; ADM1 uses the real GeoJSON.
      await tx.$executeRaw`
        UPDATE alertes SET emprise_spatiale = (
          SELECT geometrie FROM zones_administratives WHERE id_zone = ${candidate.zoneId}
        ) WHERE id_alerte = ${saved.id}`;
    }
  }
  return { created, updated, closed, windowDays };
}
