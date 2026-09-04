import { Injectable } from '@nestjs/common';
import {
  IssueClinique,
  Prisma,
  StatutAlerte,
  StatutDiag,
} from '../../../generated/prisma/client';
import { ROLES } from '../../common/constants/roles';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async centreIdFor(user: AuthenticatedUser): Promise<number | undefined> {
    if (user.role !== ROLES.MEDECIN) {
      return undefined;
    }
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: user.id },
      select: { centreId: true },
    });
    return utilisateur?.centreId ?? -1;
  }

  private async buildWhere(
    user: AuthenticatedUser,
    query: DashboardQueryDto,
  ): Promise<Prisma.CasEpidemiologiqueWhereInput> {
    const centreId = await this.centreIdFor(user);
    const where: Prisma.CasEpidemiologiqueWhereInput = {};

    if (centreId !== undefined) {
      where.centreId = centreId;
    }
    if (query.maladieId) {
      where.maladieId = query.maladieId;
    }
    if (query.zoneId) {
      where.centre = { zoneId: query.zoneId };
    }
    if (query.from || query.to) {
      where.diagnosisDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    return where;
  }

  async kpi(user: AuthenticatedUser, query: DashboardQueryDto) {
    const where = await this.buildWhere(user, query);

    const [confirmed, deces, total, activeAlertes] = await Promise.all([
      this.prisma.casEpidemiologique.count({
        where: { ...where, diagnosticStatus: StatutDiag.Confirme },
      }),
      this.prisma.casEpidemiologique.count({
        where: {
          ...where,
          diagnosticStatus: StatutDiag.Confirme,
          clinicalOutcome: IssueClinique.Deces,
        },
      }),
      this.prisma.casEpidemiologique.count({ where }),
      this.prisma.alerte.count({ where: { statutAlerte: StatutAlerte.Active } }),
    ]);

    const letalite =
      confirmed > 0 ? Number(((deces / confirmed) * 100).toFixed(1)) : 0;

    return {
      incidence: confirmed,
      letalite,
      deces,
      confirmed,
      total,
      activeAlertes,
    };
  }

  async monthly(user: AuthenticatedUser, query: DashboardQueryDto) {
    const where = await this.buildWhere(user, query);
    const cas = await this.prisma.casEpidemiologique.findMany({
      where,
      select: {
        diagnosisDate: true,
        diagnosticStatus: true,
        clinicalOutcome: true,
      },
    });

    const map = new Map<
      string,
      { confirmes: number; suspects: number; gueris: number; decedes: number }
    >();

    for (const c of cas) {
      const d = c.diagnosisDate;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = map.get(key) ?? {
        confirmes: 0,
        suspects: 0,
        gueris: 0,
        decedes: 0,
      };
      if (c.diagnosticStatus === StatutDiag.Confirme) entry.confirmes++;
      else if (c.diagnosticStatus === StatutDiag.Suspect) entry.suspects++;
      if (c.clinicalOutcome === IssueClinique.Gueri) entry.gueris++;
      else if (c.clinicalOutcome === IssueClinique.Deces) entry.decedes++;
      map.set(key, entry);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mois, v]) => ({ mois, ...v }));
  }

  async evolution(user: AuthenticatedUser, query: DashboardQueryDto) {
    const where = await this.buildWhere(user, query);
    const days = 30;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days + 1);

    const cas = await this.prisma.casEpidemiologique.findMany({
      where: {
        ...where,
        diagnosticStatus: StatutDiag.Confirme,
        diagnosisDate: { gte: start },
      },
      select: { diagnosisDate: true },
    });

    const counts = new Array<number>(days).fill(0);
    for (const c of cas) {
      const day = Math.floor(
        (c.diagnosisDate.getTime() - start.getTime()) / 86_400_000,
      );
      if (day >= 0 && day < days) {
        counts[day]++;
      }
    }

    return counts.map((valeur, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { jour: `${d.getDate()}/${d.getMonth() + 1}`, valeur };
    });
  }

  async repartition(
    user: AuthenticatedUser,
    query: DashboardQueryDto,
    dimension: string,
  ) {
    const where = await this.buildWhere(user, query);

    if (dimension === 'statut') {
      const grouped = await this.prisma.casEpidemiologique.groupBy({
        by: ['diagnosticStatus'],
        where,
        _count: { _all: true },
      });
      return grouped.map((g) => ({
        nom: g.diagnosticStatus,
        valeur: g._count._all,
      }));
    }

    const grouped = await this.prisma.casEpidemiologique.groupBy({
      by: ['maladieId'],
      where,
      _count: { _all: true },
    });
    const ids = grouped.map((g) => g.maladieId);
    const maladies = await this.prisma.maladie.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(maladies.map((m) => [m.id, m.name]));
    return grouped.map((g) => ({
      nom: nameById.get(g.maladieId) ?? 'Autre',
      valeur: g._count._all,
    }));
  }
}