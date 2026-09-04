import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Gravite,
  StatutAlerte,
  StatutDiag,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class AlertesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertesService.name);
  private interval?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.runDetection().catch((error) =>
      this.logger.error('Détection initiale des alertes impossible', error),
    );
    const hours = Number(process.env.ALERTE_INTERVAL_HOURS ?? 1);
    this.interval = setInterval(() => {
      void this.runDetection().catch((error) =>
        this.logger.error('Détection périodique des alertes impossible', error),
      );
    }, hours * 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  listActive() {
    return this.prisma.alerte.findMany({
      where: { statutAlerte: StatutAlerte.Active },
      include: {
        maladie: true,
        zone: true,
      },
      orderBy: { detectionDate: 'desc' },
    });
  }

  /**
   * Moteur d'alertes (ALT-01 / ALT-02).
   * - Fenêtre glissante de `windowDays` jours (paramétrable).
   * - Pour chaque (zone administrative × maladie) : nombre de cas `Confirme`.
   * - Création / mise à jour / clôture automatique des alertes.
   */
  async runDetection() {
    const windowDays = Number(process.env.ALERTE_WINDOW_DAYS ?? 7);
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [maladies, centres, activeAlertes] = await Promise.all([
      this.prisma.maladie.findMany(),
      this.prisma.centreSante.findMany({
        select: { id: true, zoneId: true },
      }),
      this.prisma.alerte.findMany({
        where: { statutAlerte: StatutAlerte.Active },
      }),
    ]);

    const zoneByCentre = new Map(centres.map((c) => [c.id, c.zoneId]));
    const maladieById = new Map(maladies.map((m) => [m.id, m]));
    const thresholdOf = (maladieId: number) =>
      maladieById.get(maladieId)?.alertThreshold ?? 1;

    // Comptage des cas Confirme sur la fenêtre, par (zone, maladie).
    const cases = await this.prisma.casEpidemiologique.findMany({
      where: {
        diagnosticStatus: StatutDiag.Confirme,
        diagnosisDate: { gte: cutoff },
      },
      select: { centreId: true, maladieId: true },
    });

    const countMap = new Map<string, number>();
    for (const c of cases) {
      const zoneId = zoneByCentre.get(c.centreId);
      if (zoneId == null) {
        continue;
      }
      const key = `${zoneId}:${c.maladieId}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    let created = 0;
    let updated = 0;
    let closed = 0;

    // Alertes actives existantes : mise à jour ou clôture.
    for (const alerte of activeAlertes) {
      const count = countMap.get(`${alerte.zoneId}:${alerte.maladieId}`) ?? 0;
      const threshold = thresholdOf(alerte.maladieId);
      if (count < threshold) {
        await this.prisma.alerte.update({
          where: { id: alerte.id },
          data: { statutAlerte: StatutAlerte.Cloturee },
        });
        closed++;
      } else {
        await this.prisma.alerte.update({
          where: { id: alerte.id },
          data: {
            detectedCaseCount: count,
            niveauGravite: this.computeNiveau(count, threshold),
          },
        });
        updated++;
      }
    }

    // Nouvelles alertes pour les combinaisons au-dessus du seuil.
    const zones = await this.prisma.zoneAdministrative.findMany({
      select: { id: true },
    });
    const activeKeys = new Set(
      activeAlertes.map((a) => `${a.zoneId}:${a.maladieId}`),
    );

    for (const zone of zones) {
      for (const maladie of maladies) {
        const count = countMap.get(`${zone.id}:${maladie.id}`) ?? 0;
        if (count < maladie.alertThreshold) {
          continue;
        }
        const key = `${zone.id}:${maladie.id}`;
        if (activeKeys.has(key)) {
          continue;
        }
        const alerte = await this.prisma.alerte.create({
          data: {
            maladieId: maladie.id,
            zoneId: zone.id,
            detectedCaseCount: count,
            niveauGravite: this.computeNiveau(count, maladie.alertThreshold),
            statutAlerte: StatutAlerte.Active,
            detectionDate: new Date(),
          },
        });
        await this.setEmpriseFromCentres(alerte.id, zone.id);
        created++;
      }
    }

    this.logger.log(
      `Moteur d'alertes : ${created} créée(s), ${updated} mise(s) à jour, ${closed} clôturée(s) [fenêtre ${windowDays}j]`,
    );

    return { created, updated, closed, windowDays };
  }

  private computeNiveau(count: number, threshold: number): Gravite {
    const ratio = count / Math.max(threshold, 1);
    if (ratio >= 3) return Gravite.Critique;
    if (ratio >= 2) return Gravite.Eleve;
    if (ratio >= 1.5) return Gravite.Modere;
    return Gravite.Faible;
  }

  /**
   * Renseigne l'emprise spatiale de l'alerte :
   * 1. géométrie de la zone si disponible, sinon
   * 2. polygone (buffer) autour du barycentre des centres de santé de la zone.
   */
  private async setEmpriseFromCentres(alerteId: number, zoneId: number) {
    await this.prisma.$executeRaw`
      UPDATE alertes
      SET emprise_spatiale = COALESCE(
        (SELECT geometrie FROM zones_administratives WHERE id_zone = ${zoneId}),
        (SELECT ST_Buffer(ST_Centroid(ST_Collect(localisation)), 0.5)
         FROM centres_sante
         WHERE id_zone = ${zoneId} AND localisation IS NOT NULL)
      )
      WHERE id_alerte = ${alerteId}`;
  }
}