import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Maladie } from '../../../generated/prisma/client';
import { TtlCache } from '../../common/cache/ttl-cache';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateMaladieDto } from './dto/create-maladie.dto';
import { UpdateMaladieDto } from './dto/update-maladie.dto';
import { AlertesService } from '../alertes/alertes.service';

@Injectable()
export class MaladiesService {
  private readonly logger = new Logger(MaladiesService.name);
  private readonly listCache = new TtlCache<Promise<Maladie[]>>(60_000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertesService: AlertesService,
  ) {}

  list() {
    const cached = this.listCache.get('all');
    if (cached) {
      return cached;
    }
    const data = this.prisma.maladie.findMany({
      orderBy: { name: 'asc' },
    });
    this.listCache.set('all', data);
    return data;
  }

  async create(dto: CreateMaladieDto) {
    this.listCache.clear();
    const created = await this.prisma.maladie.create({
      data: {
        name: dto.name.trim(),
        icd10Code: dto.icd10Code?.trim().toUpperCase() || null,
        alertThreshold: dto.alertThresholdRegion,
        alertThresholdCentre: dto.alertThresholdCentre,
        alertThresholdRegion: dto.alertThresholdRegion,
        description: dto.description,
      },
    });
    await this.refreshAlerts();
    return created;
  }

  async update(id: number, dto: UpdateMaladieDto) {
    const existing = await this.prisma.maladie.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Maladie introuvable.');
    }

    const data: Prisma.MaladieUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.icd10Code !== undefined) {
      data.icd10Code = dto.icd10Code?.trim().toUpperCase() || null;
    }
    if (dto.alertThresholdCentre !== undefined) {
      data.alertThresholdCentre = dto.alertThresholdCentre;
    }
    if (dto.alertThresholdRegion !== undefined) {
      data.alertThresholdRegion = dto.alertThresholdRegion;
      data.alertThreshold = dto.alertThresholdRegion;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    this.listCache.clear();
    const updated = await this.prisma.maladie.update({ where: { id }, data });
    await this.refreshAlerts();
    return updated;
  }

  private async refreshAlerts() {
    try {
      await this.alertesService.runDetection();
    } catch (error) {
      this.logger.warn(
        `Recalcul des alertes après modification d'une maladie impossible : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
