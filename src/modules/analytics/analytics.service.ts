import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TypeZone } from '../../../generated/prisma/enums';

export interface AnalyticsFilters {
  maladieId?: number;
  regionId?: number;
  districtId?: number;
  from?: Date;
  to?: Date;
}

const WEEKLY_THRESHOLD_MS = 35 * 24 * 60 * 60 * 1000;

const FROM_CLAUSE = Prisma.sql`
  FROM cas_epidemiologiques c
  JOIN centres_sante ct ON ct.id_centre = c.id_centre
  JOIN zones_administratives z ON z.id_zone = ct.id_zone
  LEFT JOIN zones_administratives zp ON zp.id_zone = z.id_zone_parent
`;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async options() {
    const [maladies, regions] = await Promise.all([
      this.prisma.maladie.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.zoneAdministrative.findMany({
        where: { type: TypeZone.Region },
        orderBy: { name: 'asc' },
        include: {
          children: {
            where: { type: TypeZone.District },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    return {
      maladies,
      regions: regions.map((region) => ({
        id: region.id,
        name: region.name,
        districts: region.children,
      })),
    };
  }

  async summary(userId: number, params: AnalyticsFilters) {
    const user = await this.prisma.utilisateur.findUnique({
      where: { id: userId },
    });

    // Périmètre : un utilisateur régional ne peut consulter que sa région.
    if (user?.regionId) {
      params = { ...params, regionId: user.regionId };
    }

    const { from, to } = params;

    const totals = await this.totals(params);
    const evolution = await this.evolution(params);
    const byRegion = await this.byRegion(params);
    const comparison =
      from && to ? await this.comparison(params, from, to) : null;

    return {
      totals: {
        ...totals,
        lethalityRate:
          totals.total > 0
            ? Math.round((totals.deceased / totals.total) * 10000) / 100
            : 0,
        recoveryRate:
          totals.total > 0
            ? Math.round((totals.recovered / totals.total) * 10000) / 100
            : 0,
      },
      evolution,
      byRegion,
      comparison,
    };
  }

  private buildWhere(f: AnalyticsFilters): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    if (f.maladieId !== undefined) {
      conditions.push(Prisma.sql`c.id_maladie = ${f.maladieId}`);
    }
    if (f.districtId !== undefined) {
      conditions.push(Prisma.sql`ct.id_zone = ${f.districtId}`);
    }
    if (f.regionId !== undefined) {
      conditions.push(Prisma.sql`zp.id_zone = ${f.regionId}`);
    }
    if (f.from) {
      conditions.push(Prisma.sql`c.date_declaration >= ${f.from}`);
    }
    if (f.to) {
      conditions.push(Prisma.sql`c.date_declaration <= ${f.to}`);
    }

    return conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;
  }

  private async totals(f: AnalyticsFilters) {
    const where = this.buildWhere(f);
    const rows = await this.prisma.$queryRaw<
      {
        total: number;
        confirmed: number;
        suspect: number;
        active: number;
        recovered: number;
        deceased: number;
      }[]
    >(Prisma.sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Confirme')::int AS confirmed,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Suspect')::int AS suspect,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'En_cours')::int AS active,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Gueri')::int AS recovered,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Deces')::int AS deceased
      ${FROM_CLAUSE}
      ${where}
    `);

    return (
      rows[0] ?? {
        total: 0,
        confirmed: 0,
        suspect: 0,
        active: 0,
        recovered: 0,
        deceased: 0,
      }
    );
  }

  private async evolution(f: AnalyticsFilters) {
    const weekly =
      !f.from ||
      !f.to ||
      f.to.getTime() - f.from.getTime() > WEEKLY_THRESHOLD_MS;

    const bucket = weekly
      ? Prisma.sql`to_char(date_trunc('week', c.date_declaration), 'YYYY-MM-DD')`
      : Prisma.sql`to_char(c.date_declaration, 'YYYY-MM-DD')`;

    const rows = await this.prisma.$queryRaw<{ date: string; count: number }[]>(
      Prisma.sql`
        SELECT ${bucket} AS date, COUNT(*)::int AS count
        ${FROM_CLAUSE}
        ${this.buildWhere(f)}
        GROUP BY date
        ORDER BY date ASC
      `,
    );

    return rows;
  }

  private async byRegion(f: AnalyticsFilters) {
    const rows = await this.prisma.$queryRaw<
      {
        regionId: number;
        region: string;
        total: number;
        confirmed: number;
        suspect: number;
        active: number;
        recovered: number;
        deceased: number;
        lethalityRate: number;
        recoveryRate: number;
      }[]
    >(Prisma.sql`
      SELECT
        COALESCE(zp.id_zone, 0)::int AS "regionId",
        COALESCE(zp.nom_zone, 'Inconnue') AS region,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Confirme')::int AS confirmed,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Suspect')::int AS suspect,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'En_cours')::int AS active,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Gueri')::int AS recovered,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Deces')::int AS deceased,
        CASE WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE c.issue_clinique = 'Deces'))::numeric / COUNT(*) * 100, 2)
          ELSE 0 END AS "lethalityRate",
        CASE WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE c.issue_clinique = 'Gueri'))::numeric / COUNT(*) * 100, 2)
          ELSE 0 END AS "recoveryRate"
      ${FROM_CLAUSE}
      ${this.buildWhere(f)}
      GROUP BY zp.id_zone, zp.nom_zone
      ORDER BY total DESC
    `);

    return rows;
  }

  private async comparison(f: AnalyticsFilters, from: Date, to: Date) {
    const lengthMs = to.getTime() - from.getTime();
    const previousTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
    const previousFrom = new Date(previousTo.getTime() - lengthMs);

    const [current, previous] = await Promise.all([
      this.totals(f),
      this.totals({ ...f, from: previousFrom, to: previousTo }),
    ]);

    const pct = (currentValue: number, previousValue: number) => {
      if (previousValue === 0) {
        return currentValue > 0 ? 100 : 0;
      }
      return (
        Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10
      );
    };

    return {
      current: {
        total: current.total,
        active: current.active,
        recovered: current.recovered,
        deceased: current.deceased,
      },
      previous: {
        total: previous.total,
        active: previous.active,
        recovered: previous.recovered,
        deceased: previous.deceased,
      },
      delta: {
        total: pct(current.total, previous.total),
        active: pct(current.active, previous.active),
        recovered: pct(current.recovered, previous.recovered),
        deceased: pct(current.deceased, previous.deceased),
      },
    };
  }
}
