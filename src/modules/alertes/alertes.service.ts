import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { StatutAlerte } from '../../../generated/prisma/client';
import { syncAlerts } from './alert-detection';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class AlertesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertesService.name);
  private interval?: NodeJS.Timeout;
  private lastRunAt = 0;
  private refreshPromise?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.ensureFresh(0).catch((error) =>
      this.logger.error('Détection initiale des alertes impossible', error),
    );
    const hours = Number(process.env.ALERTE_INTERVAL_HOURS ?? 1);
    this.interval = setInterval(
      () => {
        void this.ensureFresh(0).catch((error) =>
          this.logger.error(
            'Détection périodique des alertes impossible',
            error,
          ),
        );
      },
      hours * 60 * 60 * 1000,
    );
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
        centre: true,
      },
      orderBy: { detectionDate: 'desc' },
    });
  }

  /** Both scales use the same transaction and rolling window. */
  async runDetection() {
    const result = await this.prisma.$transaction((tx) => syncAlerts(tx), {
      maxWait: 10000,
      timeout: 120000,
    });
    this.lastRunAt = Date.now();
    this.logger.log(
      `Alertes : ${result.created} créées, ${result.updated} mises à jour, ${result.closed} clôturées (${result.windowDays}j)`,
    );
    return result;
  }

  /**
   * Garantit que les données utilisées par la carte ont été recalculées
   * récemment. Les appels simultanés partagent le même calcul.
   */
  async ensureFresh(maxAgeMs = 30_000): Promise<void> {
    if (Date.now() - this.lastRunAt <= maxAgeMs) {
      return;
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.runDetection()
        .then(() => undefined)
        .finally(() => {
          this.refreshPromise = undefined;
        });
    }
    await this.refreshPromise;
  }
}
