import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  ActionHistorique,
  NiveauRisque,
  StatutAlerte,
  TypeZone,
} from '../../../generated/prisma/enums';
import { CreateAlerteDto } from './dto/create-alerte.dto';
import { CreateRegleAlerteDto } from './dto/create-regle-alerte.dto';
import { UpdateRegleAlerteDto } from './dto/update-regle-alerte.dto';

const alerteInclude = {
  include: {
    maladie: true,
    zone: true,
    regle: true,
    assignee: { omit: { passwordHash: true, resetToken: true } },
    resolveur: { omit: { passwordHash: true, resetToken: true } },
    createur: { omit: { passwordHash: true, resetToken: true } },
  },
} as const;

@Injectable()
export class AlertesService implements OnModuleInit {
  private readonly logger = new Logger(AlertesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const enabled =
      this.configService.get<string>('ALERT_DETECTION_ENABLED') !== 'false';
    if (!enabled) {
      return;
    }

    const intervalMs =
      parseInt(
        this.configService.get<string>('ALERT_DETECTION_INTERVAL_MS') ??
          '60000',
        10,
      ) || 60000;

    const run = () => {
      this.detect()
        .then((result) => {
          this.logger.log(
            `Détection automatique : ${result.created} créées, ${result.updated} mises à jour, ${result.reopened} réouvertes, ${result.resolved} résolues.`,
          );
        })
        .catch((error) => {
          this.logger.error('Échec de la détection automatique', error);
        });
    };

    run();
    setInterval(run, intervalMs);
  }

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

  async list(filters: {
    statut?: StatutAlerte;
    niveau?: NiveauRisque;
    maladieId?: number;
    zoneId?: number;
  }) {
    const where: Prisma.AlerteWhereInput = {};
    if (filters.statut) where.statut = filters.statut;
    if (filters.niveau) where.niveauRisque = filters.niveau;
    if (filters.maladieId) where.maladieId = filters.maladieId;

    if (filters.zoneId) {
      const zone = await this.prisma.zoneAdministrative.findUnique({
        where: { id: filters.zoneId },
      });
      where.zone =
        zone?.type === TypeZone.Region
          ? { parentId: filters.zoneId }
          : { id: filters.zoneId };
    }

    const [alertes, freshness] = await Promise.all([
      this.prisma.alerte.findMany({
        where,
        ...alerteInclude,
        orderBy: [{ detectionDate: 'desc' }],
      }),
      this.freshness(),
    ]);

    return { alerts: alertes, freshness };
  }

  async notifications() {
    return this.prisma.alerte.findMany({
      include: { maladie: true, zone: true },
      orderBy: [{ detectionDate: 'desc' }],
      take: 10,
    });
  }

  async findOne(id: number) {
    const alerte = await this.prisma.alerte.findUnique({
      where: { id },
      ...alerteInclude,
      include: {
        ...alerteInclude.include,
        historique: {
          include: {
            utilisateur: { omit: { passwordHash: true, resetToken: true } },
          },
          orderBy: { date: 'asc' },
        },
      },
    });
    if (!alerte) {
      throw new NotFoundException('Alerte introuvable.');
    }
    return alerte;
  }

  async create(userId: number, dto: CreateAlerteDto) {
    const [maladie, zone] = await Promise.all([
      this.prisma.maladie.findUnique({ where: { id: dto.maladieId } }),
      this.prisma.zoneAdministrative.findUnique({ where: { id: dto.zoneId } }),
    ]);
    if (!maladie) {
      throw new BadRequestException('Maladie introuvable.');
    }
    if (!zone) {
      throw new BadRequestException('Zone introuvable.');
    }

    const alerte = await this.prisma.alerte.create({
      data: {
        maladieId: dto.maladieId,
        zoneId: dto.zoneId,
        niveauRisque: dto.niveauRisque,
        statut: StatutAlerte.Active,
        detectedCaseCount: dto.detectedCaseCount ?? 0,
        commentaire: dto.commentaire,
        createdById: userId,
      },
      ...alerteInclude,
    });

    await this.addHistory(
      alerte.id,
      ActionHistorique.Creation,
      dto.commentaire ?? 'Alerte créée manuellement.',
      userId,
    );

    return alerte;
  }

  async takeCharge(userId: number, id: number) {
    const alerte = await this.getExisting(id);
    if (alerte.statut === StatutAlerte.Resolue) {
      throw new BadRequestException(
        'Une alerte résolue ne peut pas être reprise.',
      );
    }

    const updated = await this.prisma.alerte.update({
      where: { id },
      data: { statut: StatutAlerte.EnPriseEnCharge, assigneeId: userId },
      ...alerteInclude,
    });

    await this.addHistory(
      id,
      ActionHistorique.PriseEnCharge,
      'Alerte prise en charge.',
      userId,
    );

    return updated;
  }

  async resolve(userId: number, id: number) {
    const alerte = await this.getExisting(id);
    if (alerte.statut === StatutAlerte.Resolue) {
      throw new BadRequestException("L'alerte est déjà résolue.");
    }

    const updated = await this.prisma.alerte.update({
      where: { id },
      data: {
        statut: StatutAlerte.Resolue,
        resolvedById: userId,
        resolvedAt: new Date(),
      },
      ...alerteInclude,
    });

    await this.addHistory(
      id,
      ActionHistorique.Resolution,
      'Alerte marquée comme résolue.',
      userId,
    );

    return updated;
  }

  async detect() {
    const rules = await this.prisma.regleAlerte.findMany({
      where: { active: true },
    });

    let created = 0;
    let updated = 0;
    let reopened = 0;
    let resolved = 0;

    for (const rule of rules) {
      const since = new Date();
      since.setDate(since.getDate() - rule.periodDays);

      const zone = await this.prisma.zoneAdministrative.findUnique({
        where: { id: rule.zoneId },
      });
      if (!zone) {
        continue;
      }

      const where: Prisma.CasEpidemiologiqueWhereInput = {
        declarationDate: { gte: since },
        ...(rule.maladieId ? { maladieId: rule.maladieId } : {}),
      };
      if (zone.type === TypeZone.Region) {
        where.centre = { zone: { parentId: rule.zoneId } };
      } else {
        where.centre = { zoneId: rule.zoneId };
      }

      const count = await this.prisma.casEpidemiologique.count({ where });

      const existing = await this.prisma.alerte.findFirst({
        where: { ruleId: rule.id },
      });

      if (count >= rule.threshold) {
        if (!existing) {
          const createdAlert = await this.prisma.alerte.create({
            data: {
              maladieId: rule.maladieId ?? undefined,
              zoneId: rule.zoneId,
              niveauRisque: rule.niveau,
              statut: StatutAlerte.Active,
              detectedCaseCount: count,
              ruleId: rule.id,
            },
          });
          await this.addHistory(
            createdAlert.id,
            ActionHistorique.Detection,
            `Détection automatique : ${count} cas sur ${rule.periodDays} jours (seuil ${rule.threshold}).`,
            null,
          );
          created++;
        } else if (existing.statut === StatutAlerte.Resolue) {
          await this.prisma.alerte.update({
            where: { id: existing.id },
            data: {
              statut: StatutAlerte.Active,
              niveauRisque: rule.niveau,
              detectedCaseCount: count,
              detectionDate: new Date(),
              resolvedById: null,
              resolvedAt: null,
              assigneeId: null,
            },
          });
          await this.addHistory(
            existing.id,
            ActionHistorique.Reouverture,
            `Réouverture automatique : ${count} cas détectés.`,
            null,
          );
          reopened++;
        } else {
          await this.prisma.alerte.update({
            where: { id: existing.id },
            data: {
              niveauRisque: rule.niveau,
              detectedCaseCount: count,
              detectionDate: new Date(),
            },
          });
          await this.addHistory(
            existing.id,
            ActionHistorique.MiseAJour,
            `Mise à jour automatique : ${count} cas détectés.`,
            null,
          );
          updated++;
        }
      } else if (
        existing &&
        (existing.statut === StatutAlerte.Active ||
          existing.statut === StatutAlerte.EnPriseEnCharge)
      ) {
        await this.prisma.alerte.update({
          where: { id: existing.id },
          data: { statut: StatutAlerte.Resolue, resolvedAt: new Date() },
        });
        await this.addHistory(
          existing.id,
          ActionHistorique.Resolution,
          'Auto-résolution : situation revenue sous le seuil.',
          null,
        );
        resolved++;
      }
    }

    const casesCount = await this.prisma.casEpidemiologique.count();
    const lastDetectionAt = new Date();
    await this.prisma.detectionEtat.upsert({
      where: { id: 1 },
      update: { lastDetectionAt, casesCount },
      create: { id: 1, lastDetectionAt, casesCount },
    });

    return {
      created,
      reopened,
      updated,
      resolved,
      casesCount,
      lastDetectionAt: lastDetectionAt.toISOString(),
    };
  }

  async freshness() {
    const [detectionEtat, maxDate] = await Promise.all([
      this.prisma.detectionEtat.findFirst({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.casEpidemiologique.aggregate({
        _max: { declarationDate: true },
      }),
    ]);

    const dataMax = maxDate._max.declarationDate;
    const detection = detectionEtat?.lastDetectionAt ?? null;

    return {
      lastDetectionAt: detection ? detection.toISOString() : null,
      dataMaxDate: dataMax ? dataMax.toISOString() : null,
      dataStale: dataMax
        ? Date.now() - dataMax.getTime() > 24 * 60 * 60 * 1000
        : true,
      detectionStale: detection
        ? Date.now() - detection.getTime() > 60 * 60 * 1000
        : true,
    };
  }

  // ---- Règles d'alerte ----

  async listRules() {
    return this.prisma.regleAlerte.findMany({
      include: { maladie: true, zone: true },
      orderBy: { id: 'asc' },
    });
  }

  async createRule(dto: CreateRegleAlerteDto) {
    const zone = await this.prisma.zoneAdministrative.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone) {
      throw new BadRequestException('Zone introuvable.');
    }
    if (dto.maladieId) {
      const maladie = await this.prisma.maladie.findUnique({
        where: { id: dto.maladieId },
      });
      if (!maladie) {
        throw new BadRequestException('Maladie introuvable.');
      }
    }

    return this.prisma.regleAlerte.create({
      data: {
        name: dto.name.trim(),
        description: dto.description,
        maladieId: dto.maladieId,
        zoneId: dto.zoneId,
        periodDays: dto.periodDays ?? 7,
        threshold: dto.threshold,
        niveau: dto.niveau,
        active: dto.active ?? true,
      },
      include: { maladie: true, zone: true },
    });
  }

  async updateRule(id: number, dto: UpdateRegleAlerteDto) {
    const existing = await this.prisma.regleAlerte.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Règle introuvable.');
    }

    if (dto.zoneId) {
      const zone = await this.prisma.zoneAdministrative.findUnique({
        where: { id: dto.zoneId },
      });
      if (!zone) {
        throw new BadRequestException('Zone introuvable.');
      }
    }

    return this.prisma.regleAlerte.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        maladieId: dto.maladieId,
        zoneId: dto.zoneId,
        periodDays: dto.periodDays,
        threshold: dto.threshold,
        niveau: dto.niveau,
        active: dto.active,
      },
      include: { maladie: true, zone: true },
    });
  }

  async deleteRule(id: number) {
    const existing = await this.prisma.regleAlerte.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Règle introuvable.');
    }
    await this.prisma.regleAlerte.delete({ where: { id } });
    return { success: true };
  }

  // ---- Helpers ----

  private async getExisting(id: number) {
    const alerte = await this.prisma.alerte.findUnique({ where: { id } });
    if (!alerte) {
      throw new NotFoundException('Alerte introuvable.');
    }
    return alerte;
  }

  private addHistory(
    alerteId: number,
    action: ActionHistorique,
    detail: string,
    utilisateurId: number | null,
  ) {
    return this.prisma.alerteHistorique.create({
      data: { alerteId, action, detail, utilisateurId },
    });
  }
}
