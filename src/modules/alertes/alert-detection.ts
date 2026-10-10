import {
  Gravite,
  Prisma,
  StatutAlerte,
  StatutDiag,
  TypeZone,
} from '../../../generated/prisma/client';

interface DiseaseThresholds {
  id: number;
  alertThresholdCentre: number;
  alertThresholdRegion: number;
}
interface Zone {
  id: number;
  parentId: number | null;
  type?: TypeZone;
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
  spatialRegionByCentre = new Map<number, number>(),
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
    const spatialRegionId = spatialRegionByCentre.get(centre.id);
    const visited = new Set<number>();
    while (zone && !visited.has(zone.id)) {
      visited.add(zone.id);
      // En production, un ancien rattachement administratif peut pointer vers
      // une autre ligne Region que le polygone ADM1. La localisation du centre
      // fait foi pour la couleur régionale, sans perdre les comptes de district.
      if (zone.type !== TypeZone.Region || !spatialRegionId) {
        const key = `${zone.id}:${disease.id}`;
        const aggregate = zoneCounts.get(key) ?? {
          zoneId: zone.id,
          maladieId: disease.id,
          count: 0,
        };
        aggregate.count += row.count;
        zoneCounts.set(key, aggregate);
      }
      zone = zone.parentId == null ? undefined : zoneById.get(zone.parentId);
    }
    if (spatialRegionId) {
      const key = `${spatialRegionId}:${disease.id}`;
      const aggregate = zoneCounts.get(key) ?? {
        zoneId: spatialRegionId,
        maladieId: disease.id,
        count: 0,
      };
      aggregate.count += row.count;
      zoneCounts.set(key, aggregate);
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

/** Caller supplies a transaction. The same advisory lock serializes the seed,
 * scheduled jobs and manual detections across all application instances. */
export async function syncAlerts(
  tx: Prisma.TransactionClient,
  now = new Date(),
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260920, 1)`;
  const [diseases, centres, zones, groups, existing] = await Promise.all([
    tx.maladie.findMany(),
    tx.centreSante.findMany({ select: { id: true, zoneId: true } }),
    tx.zoneAdministrative.findMany({
      select: { id: true, parentId: true, type: true },
    }),
    tx.casEpidemiologique.groupBy({
      by: ['centreId', 'maladieId'],
      where: {
        diagnosticStatus: StatutDiag.Confirme,
        diagnosisDate: { lte: now },
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
  const countedCentreIds = [...new Set(groups.map((group) => group.centreId))];
  const spatialRegions = countedCentreIds.length
    ? await tx.$queryRaw<{ centre_id: number; region_id: number }[]>`
        SELECT DISTINCT ON (c.id_centre)
          c.id_centre AS centre_id, r.id_zone AS region_id
        FROM centres_sante c
        JOIN zones_administratives r
          ON r.type_zone = 'Region' AND r.geometrie IS NOT NULL
          AND ST_Covers(
            r.geometrie,
            COALESCE(c.localisation,
              ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326))
          )
        WHERE c.id_centre IN (${Prisma.join(countedCentreIds)})
        ORDER BY c.id_centre, r.id_zone
      `
    : [];
  const candidates = buildAlertCandidates(
    diseases,
    centres,
    zones,
    groups.map((g) => ({
      centreId: g.centreId,
      maladieId: g.maladieId,
      count: g._count._all,
    })),
    new Map(spatialRegions.map((row) => [row.centre_id, row.region_id])),
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
  return { created, updated, closed };
}
