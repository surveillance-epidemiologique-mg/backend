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

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.runDetection().catch((error) =>
      this.logger.error('Détection initiale des alertes impossible', error),
    );
    const hours = Number(process.env.ALERTE_INTERVAL_HOURS ?? 1);
    this.interval = setInterval(
      () => {
        void this.runDetection().catch((error) =>
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
    this.logger.log(
      `Alertes : ${result.created} créées, ${result.updated} mises à jour, ${result.closed} clôturées (${result.windowDays}j)`,
    );
    return result;
  }
}
