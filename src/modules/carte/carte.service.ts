import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

export type NiveauEpidemiologique =
  'Aucun' | 'Faible' | 'Modere' | 'Eleve' | 'Critique';

export interface CarteQuery {
  maladieId?: number;
  regionId?: number;
  districtId?: number;
  centreId?: number;
  from?: string;
  to?: string;
  typeEtablissement?: string;
}

interface Scope {
  userId: number;
  regionId?: number;
  districtId?: number;
}

const FROM_CLAUSE = Prisma.sql`
  FROM cas_epidemiologiques c
  JOIN centres_sante ct ON ct.id_centre = c.id_centre
  JOIN zones_administratives z ON z.id_zone = ct.id_zone
  LEFT JOIN zones_administratives zp ON zp.id_zone = z.id_zone_parent
`;

/**
 * Niveau épidémiologique calculé côté serveur à partir du nombre réel
 * de cas (maladie + période sélectionnées).
 * Règles (identiques à la légende) :
 *   0 cas        -> Aucun
 *   1 à 2 cas    -> Faible
 *   3 à 5 cas    -> Modere
 *   6 à 10 cas   -> Eleve
 *   plus de 10   -> Critique
 */
export function niveauFromCases(count: number): NiveauEpidemiologique {
  if (count <= 0) return 'Aucun';
  if (count <= 2) return 'Faible';
  if (count <= 5) return 'Modere';
  if (count <= 10) return 'Eleve';
  return 'Critique';
}

@Injectable()
export class CarteService {
  constructor(private readonly prisma: PrismaService) {}

  async getMapData(userId: number, query: CarteQuery) {
    const scope = await this.resolveScope(userId);

    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    const caseWhere = this.buildCaseWhere(scope, query, fromDate, toDate);
    const newSince = new Date(Date.now() - 7 * 86400000);

    const [regionRows, newRows, establishmentRows, activeAlerts] =
      await Promise.all([
        this.regionStats(caseWhere),
        this.newCases(caseWhere, newSince),
        this.establishments(scope, query, fromDate, toDate),
        this.activeAlerts(query, scope),
      ]);

    const newMap = new Map(newRows.map((r) => [r.region, r.count]));
    const alertMap = new Map(
      activeAlerts.map((a) => [a.region, a.niveauRisque]),
    );

    const regions = await this.prisma.zoneAdministrative.findMany({
      where: { type: 'Region' },
      orderBy: { name: 'asc' },
    });

    const regionData = regions.map((region) => {
      const row = regionRows.find((r) => r.region === region.name);
      const total = row?.total ?? 0;
      return {
        regionId: region.id,
        region: region.name,
        total,
        newCases: newMap.get(region.name) ?? 0,
        active: row?.active ?? 0,
        confirmed: row?.confirmed ?? 0,
        recovered: row?.recovered ?? 0,
        deceased: row?.deceased ?? 0,
        establishmentsCount: establishmentRows.filter(
          (e) => e.region === region.name,
        ).length,
        niveau: niveauFromCases(total),
        alerteLevel: alertMap.get(region.name) ?? null,
      };
    });

    return {
      regions: regionData,
      establishments: establishmentRows.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        region: e.region,
        district: e.district,
        address: e.address,
        latitude: e.latitude,
        longitude: e.longitude,
        isActive: e.isActive,
        cases: e.cases,
        niveau: niveauFromCases(e.cases),
      })),
    };
  }

  private async resolveScope(userId: number): Promise<Scope> {
    const user = await this.prisma.utilisateur.findUnique({
      where: { id: userId },
    });
    if (!user) {
      return { userId };
    }
    if (user.regionId) {
      return { userId, regionId: user.regionId };
    }
    if (user.centreId) {
      const centre = await this.prisma.centreSante.findUnique({
        where: { id: user.centreId },
      });
      return { userId, districtId: centre?.zoneId ?? undefined };
    }
    return { userId };
  }

  private buildCaseWhere(
    scope: Scope,
    query: CarteQuery,
    from?: Date,
    to?: Date,
  ): Prisma.Sql {
    const conds: Prisma.Sql[] = [];
    if (query.maladieId !== undefined) {
      conds.push(Prisma.sql`c.id_maladie = ${query.maladieId}`);
    }
    if (scope.districtId !== undefined) {
      conds.push(Prisma.sql`ct.id_zone = ${scope.districtId}`);
    } else if (scope.regionId !== undefined) {
      conds.push(Prisma.sql`zp.id_zone = ${scope.regionId}`);
    } else if (query.districtId !== undefined) {
      conds.push(Prisma.sql`ct.id_zone = ${query.districtId}`);
    } else if (query.regionId !== undefined) {
      conds.push(Prisma.sql`zp.id_zone = ${query.regionId}`);
    } else if (query.centreId !== undefined) {
      conds.push(Prisma.sql`c.id_centre = ${query.centreId}`);
    }
    if (from) conds.push(Prisma.sql`c.date_declaration >= ${from}`);
    if (to) conds.push(Prisma.sql`c.date_declaration <= ${to}`);
    return conds.length
      ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
      : Prisma.empty;
  }

  private async regionStats(where: Prisma.Sql) {
    return this.prisma.$queryRaw<
      {
        region: string;
        total: number;
        confirmed: number;
        active: number;
        recovered: number;
        deceased: number;
      }[]
    >(Prisma.sql`
      SELECT
        COALESCE(zp.nom_zone, 'Inconnue') AS region,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Confirme')::int AS confirmed,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'En_cours')::int AS active,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Gueri')::int AS recovered,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Deces')::int AS deceased
      ${FROM_CLAUSE}
      ${where}
      GROUP BY zp.nom_zone
    `);
  }

  private async newCases(where: Prisma.Sql, since: Date) {
    return this.prisma.$queryRaw<{ region: string; count: number }[]>(
      Prisma.sql`
        SELECT COALESCE(zp.nom_zone, 'Inconnue') AS region, COUNT(*)::int AS count
        ${FROM_CLAUSE}
        ${where}
        AND c.date_declaration >= ${since}
        GROUP BY zp.nom_zone
      `,
    );
  }

  private async establishments(
    scope: Scope,
    query: CarteQuery,
    from?: Date,
    to?: Date,
  ) {
    const conds: Prisma.Sql[] = [];
    if (scope.districtId !== undefined) {
      conds.push(Prisma.sql`ct.id_zone = ${scope.districtId}`);
    } else if (scope.regionId !== undefined) {
      conds.push(Prisma.sql`z.id_zone_parent = ${scope.regionId}`);
    } else if (query.districtId !== undefined) {
      conds.push(Prisma.sql`ct.id_zone = ${query.districtId}`);
    } else if (query.regionId !== undefined) {
      conds.push(Prisma.sql`z.id_zone_parent = ${query.regionId}`);
    } else if (query.centreId !== undefined) {
      conds.push(Prisma.sql`ct.id_centre = ${query.centreId}`);
    }
    if (query.typeEtablissement) {
      conds.push(Prisma.sql`ct.type_centre = ${query.typeEtablissement}`);
    }

    const where = conds.length
      ? Prisma.sql`AND ${Prisma.join(conds, ' AND ')}`
      : Prisma.empty;

    const caseFilter: Prisma.Sql[] = [];
    if (query.maladieId !== undefined) {
      caseFilter.push(Prisma.sql`c.id_maladie = ${query.maladieId}`);
    }
    if (from) caseFilter.push(Prisma.sql`c.date_declaration >= ${from}`);
    if (to) caseFilter.push(Prisma.sql`c.date_declaration <= ${to}`);
    const on = caseFilter.length
      ? Prisma.sql`AND ${Prisma.join(caseFilter, ' AND ')}`
      : Prisma.empty;

    return this.prisma.$queryRaw<
      {
        id: number;
        name: string;
        type: string;
        region: string;
        district: string;
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        isActive: boolean;
        cases: number;
      }[]
    >(Prisma.sql`
      SELECT
        ct.id_centre AS id,
        ct.nom_centre AS name,
        ct.type_centre AS type,
        COALESCE(zp.nom_zone, 'Inconnue') AS region,
        z.nom_zone AS district,
        ct.adresse AS address,
        ct.latitude,
        ct.longitude,
        ct.is_active AS "isActive",
        COUNT(c.id_cas)::int AS cases
      FROM centres_sante ct
      JOIN zones_administratives z ON z.id_zone = ct.id_zone
      LEFT JOIN zones_administratives zp ON zp.id_zone = z.id_zone_parent
      LEFT JOIN cas_epidemiologiques c ON c.id_centre = ct.id_centre ${on}
      WHERE ct.is_active = true ${where}
      GROUP BY ct.id_centre, ct.nom_centre, ct.type_centre, zp.nom_zone, z.nom_zone,
               ct.adresse, ct.latitude, ct.longitude, ct.is_active
      ORDER BY ct.nom_centre ASC
    `);
  }

  private async activeAlerts(query: CarteQuery, scope: Scope) {
    const where: Prisma.AlerteWhereInput = {
      statut: 'Active',
      ...(query.maladieId ? { maladieId: query.maladieId } : {}),
    };
    if (scope.districtId) {
      where.zone = { id: scope.districtId };
    } else if (scope.regionId) {
      where.zone = { parentId: scope.regionId };
    } else if (query.districtId) {
      where.zone = { id: query.districtId };
    } else if (query.regionId) {
      where.zone = { parentId: query.regionId };
    }

    const alerts = await this.prisma.alerte.findMany({
      where,
      select: {
        zone: { select: { parent: { select: { name: true } } } },
        zoneId: true,
        niveauRisque: true,
      },
    });

    const byRegion = new Map<string, number>();
    for (const alert of alerts) {
      const regionName = alert.zone?.parent?.name;
      if (!regionName) continue;
      const rank = this.niveauRank(alert.niveauRisque);
      const current = byRegion.get(regionName) ?? 0;
      if (rank > current) {
        byRegion.set(regionName, rank);
      }
    }

    const names = ['Normal', 'Surveillance', 'Alerte', 'Critique'];
    return [...byRegion.entries()].map(([region, rank]) => ({
      region,
      niveauRisque: names[rank] ?? 'Normal',
    }));
  }

  private niveauRank(niveau: string): number {
    return ['Normal', 'Surveillance', 'Alerte', 'Critique'].indexOf(niveau);
  }
}
