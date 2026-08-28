import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  IssueClinique,
  StatutAlerte,
  StatutDiag,
} from '../../../generated/prisma/enums';

export type CaseDisplayStatus =
  'SUSPECT' | 'CONFIRMED' | 'RECOVERED' | 'DECEASED';

const EVOLUTION_DAYS = 14;
const NEW_CASES_DAYS = 7;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(diseaseId?: number) {
    const where = diseaseId ? { maladieId: diseaseId } : {};
    const since = new Date();
    since.setDate(since.getDate() - NEW_CASES_DAYS);

    const [
      total,
      newCases,
      active,
      recovered,
      deceased,
      confirmed,
      suspect,
      activeAlerts,
      recentCases,
      recentAlerts,
    ] = await Promise.all([
      this.prisma.casEpidemiologique.count({ where }),
      this.prisma.casEpidemiologique.count({
        where: { ...where, declarationDate: { gte: since } },
      }),
      this.prisma.casEpidemiologique.count({
        where: { ...where, clinicalOutcome: IssueClinique.EnCours },
      }),
      this.prisma.casEpidemiologique.count({
        where: { ...where, clinicalOutcome: IssueClinique.Gueri },
      }),
      this.prisma.casEpidemiologique.count({
        where: { ...where, clinicalOutcome: IssueClinique.Deces },
      }),
      this.prisma.casEpidemiologique.count({
        where: { ...where, diagnosticStatus: StatutDiag.Confirme },
      }),
      this.prisma.casEpidemiologique.count({
        where: { ...where, diagnosticStatus: StatutDiag.Suspect },
      }),
      this.prisma.alerte.count({
        where: {
          ...(diseaseId ? { maladieId: diseaseId } : {}),
          statut: StatutAlerte.Active,
        },
      }),
      this.prisma.casEpidemiologique.findMany({
        where,
        include: {
          patient: true,
          centre: { include: { zone: true } },
          maladie: true,
        },
        orderBy: { declarationDate: 'desc' },
        take: 5,
      }),
      this.prisma.alerte.findMany({
        where: diseaseId ? { maladieId: diseaseId } : {},
        include: { maladie: true, zone: true },
        orderBy: { detectionDate: 'desc' },
        take: 5,
      }),
    ]);

    const [evolution, distribution] = await Promise.all([
      this.computeEvolution(where),
      this.computeDistribution(where),
    ]);

    return {
      stats: {
        total,
        newCases,
        active,
        recovered,
        deceased,
        confirmed,
        suspect,
        activeAlerts,
      },
      evolution,
      distribution,
      recentAlerts: recentAlerts.map((alerte) => ({
        id: alerte.id,
        maladie: alerte.maladie?.name ?? 'Toutes maladies',
        zone: alerte.zone.name,
        detectionDate: alerte.detectionDate.toISOString(),
        niveauRisque: alerte.niveauRisque,
        statut: alerte.statut,
        detectedCaseCount: alerte.detectedCaseCount,
      })),
      recentCases: recentCases.map((cas) => ({
        id: String(cas.id),
        code: `CAS-${String(cas.id).padStart(4, '0')}`,
        patient: cas.patient.anonymousCode,
        zone: cas.centre?.zone?.name ?? '—',
        maladie: cas.maladie.name,
        status: this.mapStatus(cas.diagnosticStatus, cas.clinicalOutcome),
        reportedAt: cas.declarationDate.toISOString(),
      })),
    };
  }

  private async computeEvolution(where: Record<string, unknown>) {
    const today = new Date();
    const keys: string[] = [];
    for (let i = EVOLUTION_DAYS - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      keys.push(this.toDateKey(date));
    }

    const buckets = new Map<string, number>(keys.map((key) => [key, 0]));

    const rows = await this.prisma.casEpidemiologique.findMany({
      where,
      select: { declarationDate: true },
    });

    for (const row of rows) {
      const key = this.toDateKey(row.declarationDate);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }

    return keys.map((date) => ({ date, count: buckets.get(date) ?? 0 }));
  }

  private async computeDistribution(where: Record<string, unknown>) {
    const rows = await this.prisma.casEpidemiologique.findMany({
      where,
      select: {
        centre: { select: { zone: { select: { name: true } } } },
      },
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
      const name = row.centre?.zone?.name ?? 'Inconnue';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([zone, count]) => ({ zone, count }))
      .sort((a, b) => b.count - a.count);
  }

  private toDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private mapStatus(
    diagnosticStatus: StatutDiag,
    clinicalOutcome: IssueClinique,
  ): CaseDisplayStatus {
    if (clinicalOutcome === IssueClinique.Deces) {
      return 'DECEASED';
    }
    if (clinicalOutcome === IssueClinique.Gueri) {
      return 'RECOVERED';
    }
    if (diagnosticStatus === StatutDiag.Confirme) {
      return 'CONFIRMED';
    }
    return 'SUSPECT';
  }

  // ---- Vue nationale (centre de surveillance) ----

  async surveillance(
    userId: number,
    query: {
      from?: string;
      to?: string;
      maladieId?: number;
      regionId?: number;
      districtId?: number;
      centreId?: number;
    },
  ) {
    const scope = await this.resolveScope(userId);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    const where = this.buildSurveillanceWhere(scope, query, from, to);
    const newSince = new Date(Date.now() - NEW_CASES_DAYS * 86400000);

    const prev = this.previousWindow(from, to);
    const prevWhere = this.buildSurveillanceWhere(scope, query, prev.from, prev.to);

    const [
      kpi,
      prevKpi,
      diseaseRegionRows,
      regionStats,
      establishmentsSummary,
      activeAlerts,
      evolution,
      allRegions,
      recentCases,
    ] = await Promise.all([
      this.surveillanceKpis(where, newSince),
      this.surveillanceKpis(prevWhere, newSince),
      this.surveillanceDiseaseRegion(where, newSince),
      this.surveillanceRegionStats(where, newSince),
      this.surveillanceEstablishmentsSummary(scope, query, from, to),
      this.prisma.alerte.findMany({
        where: {
          statut: StatutAlerte.Active,
          ...(query.maladieId ? { maladieId: query.maladieId } : {}),
          ...(scope.districtId
            ? { zone: { id: scope.districtId } }
            : scope.regionId
              ? { zone: { parentId: scope.regionId } }
              : query.districtId
                ? { zone: { id: query.districtId } }
                : query.regionId
                  ? { zone: { parentId: query.regionId } }
                  : {}),
        },
        include: { maladie: true, zone: true },
        orderBy: { detectionDate: 'desc' },
        take: 8,
      }),
      this.surveillanceEvolution(where, from, to),
      this.prisma.zoneAdministrative.findMany({
        where: { type: 'Region' },
        select: { id: true, name: true },
      }),
      this.prisma.casEpidemiologique.findMany({
        where: {
          ...(scope.districtId
            ? { centre: { zoneId: scope.districtId } }
            : scope.regionId
              ? { centre: { zone: { parentId: scope.regionId } } }
              : query.districtId
                ? { centre: { zoneId: query.districtId } }
                : query.regionId
                  ? { centre: { zone: { parentId: query.regionId } } }
                  : query.centreId
                    ? { centreId: query.centreId }
                    : {}),
          ...(query.maladieId ? { maladieId: query.maladieId } : {}),
          ...(from || to
            ? {
                declarationDate: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
        include: {
          patient: true,
          centre: { include: { zone: true } },
          maladie: true,
        },
        orderBy: { declarationDate: 'desc' },
        take: 5,
      }),
    ]);

    const regionIdByName = new Map(allRegions.map((r) => [r.name, r.id]));

    // Agrégations par maladie et par région à partir de la matrice
    const diseaseMap = new Map<
      string,
      {
        maladie: string;
        total: number;
        newCases: number;
        deceased: number;
        topRegion: string | null;
      }
    >();
    const regionMap = new Map<
      string,
      {
        region: string;
        regionId: number | null;
        total: number;
        diseases: Map<
          string,
          {
            maladie: string;
            total: number;
            newCases: number;
            active: number;
            deceased: number;
          }
        >;
      }
    >();

    for (const row of diseaseRegionRows) {
      let disease = diseaseMap.get(row.maladie);
      if (!disease) {
        disease = {
          maladie: row.maladie,
          total: 0,
          newCases: 0,
          deceased: 0,
          topRegion: null,
        };
        diseaseMap.set(row.maladie, disease);
      }
      disease.total += row.total;
      disease.newCases += row.newCases;
      disease.deceased += row.deceased;

      let region = regionMap.get(row.region);
      if (!region) {
        region = {
          region: row.region,
          regionId: regionIdByName.get(row.region) ?? null,
          total: 0,
          diseases: new Map(),
        };
        regionMap.set(row.region, region);
      }
      region.total += row.total;
      region.diseases.set(row.maladie, {
        maladie: row.maladie,
        total: row.total,
        newCases: row.newCases,
        active: row.active,
        deceased: row.deceased,
      });
    }

    // top région par maladie (région avec le plus de cas)
    const topByDisease = new Map<string, { region: string; total: number }>();
    for (const row of diseaseRegionRows) {
      const current = topByDisease.get(row.maladie);
      if (!current || row.total > current.total) {
        topByDisease.set(row.maladie, { region: row.region, total: row.total });
      }
    }

    const diseases = [...diseaseMap.values()].map((d) => ({
      ...d,
      topRegion: topByDisease.get(d.maladie)?.region ?? null,
      niveau: niveauFromCases(d.total),
    }));

    const regions = allRegions.map((region) => {
      const data = regionMap.get(region.name);
      const stats = regionStats.find((r) => r.region === region.name);
      return {
        regionId: region.id,
        region: region.name,
        total: data?.total ?? stats?.total ?? 0,
        newCases: stats?.newCases ?? 0,
        active: stats?.active ?? 0,
        recovered: stats?.recovered ?? 0,
        deceased: stats?.deceased ?? 0,
        confirmed: stats?.confirmed ?? 0,
        suspected: stats?.suspected ?? 0,
        establishmentsCount: establishmentsSummary.byRegion.get(region.name) ?? 0,
        niveau: niveauFromCases(data?.total ?? stats?.total ?? 0),
        diseases: data
          ? [...data.diseases.values()]
              .sort((a, b) => b.total - a.total)
              .slice(0, 5)
          : [],
      };
    });

    const priorityZones = regions
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((r, index) => ({ rank: index + 1, ...r }));

    const globalTotal = kpi.total;
    const deltas = this.computeDeltas(kpi, prevKpi);
    const cfr = globalTotal > 0 ? Math.round((kpi.deceased / globalTotal) * 100) : 0;

    return {
      meta: {
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
        generatedAt: new Date().toISOString(),
        globalLevel: niveauFromCases(globalTotal),
      },
      kpis: {
        ...kpi,
        activeAlerts: activeAlerts.length,
        cfr,
        deltas,
      },
      diseases: diseases.sort((a, b) => b.total - a.total),
      regions,
      priorityZones,
      evolution,
      establishments: establishmentsSummary.summary,
      activeAlerts: activeAlerts.map((a) => ({
        id: a.id,
        maladie: a.maladie?.name ?? 'Toutes maladies',
        zone: a.zone.name,
        detectionDate: a.detectionDate.toISOString(),
        niveauRisque: a.niveauRisque,
        statut: a.statut,
        detectedCaseCount: a.detectedCaseCount,
      })),
      recentCases: recentCases.map((cas) => ({
        id: String(cas.id),
        code: `CAS-${String(cas.id).padStart(4, '0')}`,
        patient: cas.patient.anonymousCode,
        zone: cas.centre?.zone?.name ?? '—',
        maladie: cas.maladie.name,
        status: this.mapStatus(cas.diagnosticStatus, cas.clinicalOutcome),
        reportedAt: cas.declarationDate.toISOString(),
      })),
    };
  }

  private async resolveScope(
    userId: number,
  ): Promise<{ regionId?: number; districtId?: number }> {
    const user = await this.prisma.utilisateur.findUnique({
      where: { id: userId },
    });
    if (!user) return {};
    if (user.regionId) return { regionId: user.regionId };
    if (user.centreId) {
      const centre = await this.prisma.centreSante.findUnique({
        where: { id: user.centreId },
      });
      return { districtId: centre?.zoneId ?? undefined };
    }
    return {};
  }

  private buildSurveillanceWhere(
    scope: { regionId?: number; districtId?: number },
    query: {
      maladieId?: number;
      regionId?: number;
      districtId?: number;
      centreId?: number;
    },
    from?: Date,
    to?: Date,
  ): Prisma.Sql {
    const conds: Prisma.Sql[] = [];
    if (scope.districtId !== undefined)
      conds.push(Prisma.sql`ct.id_zone = ${scope.districtId}`);
    else if (scope.regionId !== undefined)
      conds.push(Prisma.sql`zp.id_zone = ${scope.regionId}`);

    if (query.maladieId !== undefined)
      conds.push(Prisma.sql`c.id_maladie = ${query.maladieId}`);
    if (query.regionId !== undefined && scope.regionId === undefined)
      conds.push(Prisma.sql`zp.id_zone = ${query.regionId}`);
    if (query.districtId !== undefined && scope.districtId === undefined)
      conds.push(Prisma.sql`ct.id_zone = ${query.districtId}`);
    if (query.centreId !== undefined)
      conds.push(Prisma.sql`c.id_centre = ${query.centreId}`);

    if (from) conds.push(Prisma.sql`c.date_declaration >= ${from}`);
    if (to) conds.push(Prisma.sql`c.date_declaration <= ${to}`);
    return conds.length
      ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
      : Prisma.empty;
  }

  private previousWindow(
    from?: Date,
    to?: Date,
  ): { from?: Date; to?: Date } {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 30 * 86400000);
    const duration = end.getTime() - start.getTime() || 86400000;
    return {
      from: new Date(start.getTime() - duration),
      to: start,
    };
  }

  private computeDeltas(
    current: { total: number; newCases: number; active: number; recovered: number; deceased: number },
    previous: { total: number; newCases: number; active: number; recovered: number; deceased: number },
  ): { total: number; newCases: number; active: number; recovered: number; deceased: number } {
    const delta = (value: number, base: number) =>
      base > 0 ? Math.round(((value - base) / base) * 100) : value > 0 ? 100 : 0;
    return {
      total: delta(current.total, previous.total),
      newCases: delta(current.newCases, previous.newCases),
      active: delta(current.active, previous.active),
      recovered: delta(current.recovered, previous.recovered),
      deceased: delta(current.deceased, previous.deceased),
    };
  }

  private surveillanceFromClause() {
    return Prisma.sql`
      FROM cas_epidemiologiques c
      JOIN centres_sante ct ON ct.id_centre = c.id_centre
      JOIN zones_administratives z ON z.id_zone = ct.id_zone
      LEFT JOIN zones_administratives zp ON zp.id_zone = z.id_zone_parent
    `;
  }

  private async surveillanceKpis(where: Prisma.Sql, newSince: Date) {
    const rows = await this.prisma.$queryRaw<
      {
        total: number;
        newCases: number;
        active: number;
        recovered: number;
        deceased: number;
        confirmed: number;
        suspected: number;
      }[]
    >(Prisma.sql`
SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.date_declaration >= ${newSince})::int AS "newCases",
        COUNT(*) FILTER (WHERE c.issue_clinique = 'En_cours')::int AS active,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Gueri')::int AS recovered,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Deces')::int AS deceased,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Confirme')::int AS confirmed,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Suspect')::int AS suspected
      ${this.surveillanceFromClause()}
      ${where}
    `);
    return rows[0] ?? { total: 0, newCases: 0, active: 0, recovered: 0, deceased: 0, confirmed: 0, suspected: 0 };
  }

  private async surveillanceDiseaseRegion(where: Prisma.Sql, newSince: Date) {
    return this.prisma.$queryRaw<
      {
        region: string;
        maladie: string;
        total: number;
        newCases: number;
        active: number;
        recovered: number;
        deceased: number;
      }[]
    >(Prisma.sql`
      SELECT
        COALESCE(zp.nom_zone, 'Inconnue') AS region,
        m.nom_maladie AS maladie,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.date_declaration >= ${newSince})::int AS "newCases",
        COUNT(*) FILTER (WHERE c.issue_clinique = 'En_cours')::int AS active,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Gueri')::int AS recovered,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Deces')::int AS deceased
      ${this.surveillanceFromClause()}
      JOIN maladies m ON m.id_maladie = c.id_maladie
      ${where}
      GROUP BY zp.nom_zone, m.nom_maladie
      ORDER BY m.nom_maladie, total DESC
    `);
  }

  private async surveillanceRegionStats(where: Prisma.Sql, newSince: Date) {
    return this.prisma.$queryRaw<
      {
        region: string;
        total: number;
        newCases: number;
        active: number;
        recovered: number;
        deceased: number;
        confirmed: number;
        suspected: number;
      }[]
    >(Prisma.sql`
      SELECT
        COALESCE(zp.nom_zone, 'Inconnue') AS region,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.date_declaration >= ${newSince})::int AS "newCases",
        COUNT(*) FILTER (WHERE c.issue_clinique = 'En_cours')::int AS active,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Gueri')::int AS recovered,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Deces')::int AS deceased,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Confirme')::int AS confirmed,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Suspect')::int AS suspected
      ${this.surveillanceFromClause()}
      ${where}
      GROUP BY zp.nom_zone
    `);
  }

  private async surveillanceEstablishmentsSummary(
    scope: { regionId?: number; districtId?: number },
    query: { regionId?: number; districtId?: number; centreId?: number },
    from?: Date,
    to?: Date,
  ) {
    const conds: Prisma.Sql[] = [];
    if (scope.districtId !== undefined)
      conds.push(Prisma.sql`ct.id_zone = ${scope.districtId}`);
    else if (scope.regionId !== undefined)
      conds.push(Prisma.sql`z.id_zone_parent = ${scope.regionId}`);
    else if (query.districtId !== undefined)
      conds.push(Prisma.sql`ct.id_zone = ${query.districtId}`);
    else if (query.regionId !== undefined)
      conds.push(Prisma.sql`z.id_zone_parent = ${query.regionId}`);
    if (query.centreId !== undefined)
      conds.push(Prisma.sql`ct.id_centre = ${query.centreId}`);
    const where = conds.length
      ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
      : Prisma.empty;

    const caseFilter: Prisma.Sql[] = [];
    if (query.centreId !== undefined)
      caseFilter.push(Prisma.sql`c.id_centre = ${query.centreId}`);
    if (from) caseFilter.push(Prisma.sql`c.date_declaration >= ${from}`);
    if (to) caseFilter.push(Prisma.sql`c.date_declaration <= ${to}`);
    const caseWhere = caseFilter.length
      ? Prisma.sql`AND ${Prisma.join(caseFilter, ' AND ')}`
      : Prisma.empty;

    const [totals, withCases, byRegion] = await Promise.all([
      this.prisma.$queryRaw<{ total: number; active: number }[]>`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE ct.is_active)::int AS active
        FROM centres_sante ct
        JOIN zones_administratives z ON z.id_zone = ct.id_zone
        LEFT JOIN zones_administratives zp ON zp.id_zone = z.id_zone_parent
        ${where}
      `,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(DISTINCT c.id_centre)::int AS count
        FROM cas_epidemiologiques c
        JOIN centres_sante ct ON ct.id_centre = c.id_centre
        JOIN zones_administratives z ON z.id_zone = ct.id_zone
        LEFT JOIN zones_administratives zp ON zp.id_zone = z.id_zone_parent
        WHERE 1=1
        ${scope.districtId !== undefined ? Prisma.sql`AND ct.id_zone = ${scope.districtId}` : Prisma.empty}
        ${scope.regionId !== undefined ? Prisma.sql`AND zp.id_zone = ${scope.regionId}` : Prisma.empty}
        ${query.regionId !== undefined && scope.regionId === undefined ? Prisma.sql`AND zp.id_zone = ${query.regionId}` : Prisma.empty}
        ${query.districtId !== undefined && scope.districtId === undefined ? Prisma.sql`AND ct.id_zone = ${query.districtId}` : Prisma.empty}
        ${caseWhere}
      `,
      this.prisma.$queryRaw<{ region: string; count: number }[]>`
        SELECT COALESCE(zp.nom_zone, 'Inconnue') AS region, COUNT(*)::int AS count
        FROM centres_sante ct
        JOIN zones_administratives z ON z.id_zone = ct.id_zone
        LEFT JOIN zones_administratives zp ON zp.id_zone = z.id_zone_parent
        ${where}
        GROUP BY zp.nom_zone
      `,
    ]);

    const byRegionMap = new Map(byRegion.map((r) => [r.region, r.count]));

    return {
      summary: {
        total: totals[0]?.total ?? 0,
        active: totals[0]?.active ?? 0,
        withCases: withCases[0]?.count ?? 0,
      },
      byRegion: byRegionMap,
    };
  }

  private async surveillanceEvolution(
    where: Prisma.Sql,
    from?: Date,
    to?: Date,
  ) {
    const length = from && to ? to.getTime() - from.getTime() : 0;
    const bucket =
      !from || !to || length > 45 * 86400000
        ? Prisma.sql`to_char(date_trunc('month', c.date_declaration), 'YYYY-MM')`
        : length > 8 * 86400000
          ? Prisma.sql`to_char(date_trunc('week', c.date_declaration), 'YYYY-MM-DD')`
          : Prisma.sql`to_char(c.date_declaration, 'YYYY-MM-DD')`;

    return this.prisma.$queryRaw<
      { date: string; cases: number; active: number; recovered: number; deceased: number; confirmed: number; suspected: number }[]
    >(Prisma.sql`
      SELECT ${bucket} AS date,
        COUNT(*)::int AS cases,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'En_cours')::int AS active,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Gueri')::int AS recovered,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Deces')::int AS deceased,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Confirme')::int AS confirmed,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Suspect')::int AS suspected
      ${this.surveillanceFromClause()}
      ${where}
      GROUP BY date
      ORDER BY date ASC
    `);
  }
}

export function niveauFromCases(
  count: number,
): 'Aucun' | 'Faible' | 'Modere' | 'Eleve' | 'Critique' {
  if (count <= 0) return 'Aucun';
  if (count <= 2) return 'Faible';
  if (count <= 5) return 'Modere';
  if (count <= 10) return 'Eleve';
  return 'Critique';
}
