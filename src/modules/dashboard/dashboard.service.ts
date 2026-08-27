import { Injectable } from '@nestjs/common';
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
}
