import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { TtlCache } from '../../common/cache/ttl-cache';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateCentreDto } from './dto/create-centre.dto';
import { UpdateCentreDto } from './dto/update-centre.dto';

const centreWithZoneArgs = {
  include: { zone: true },
} as const;

@Injectable()
export class CentresService {
  private readonly listCache = new TtlCache<ReturnType<typeof this.list>>(
    60_000,
  );
  private readonly zonesCache = new TtlCache<
    ReturnType<typeof this.listZones>
  >(300_000);

  constructor(private readonly prisma: PrismaService) {}

  list() {
    const cached = this.listCache.get('all');
    if (cached) {
      return cached;
    }
    const data = this.prisma.centreSante.findMany({
      ...centreWithZoneArgs,
      orderBy: { name: 'asc' },
    });
    this.listCache.set('all', data);
    return data;
  }

  listZones() {
    const cached = this.zonesCache.get('all');
    if (cached) {
      return cached;
    }
    const data = this.prisma.zoneAdministrative.findMany({
      orderBy: { name: 'asc' },
    });
    this.zonesCache.set('all', data);
    return data;
  }

  async create(dto: CreateCentreDto) {
    const zone = await this.prisma.zoneAdministrative.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone) {
      throw new NotFoundException('Zone introuvable.');
    }

    this.listCache.clear();
    return this.prisma.centreSante.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        zoneId: dto.zoneId,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      ...centreWithZoneArgs,
    });
  }

  async update(id: number, dto: UpdateCentreDto) {
    const existing = await this.prisma.centreSante.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Centre de santé introuvable.');
    }

    const data: Prisma.CentreSanteUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.type !== undefined) {
      data.type = dto.type;
    }
    if (dto.zoneId !== undefined) {
      const zone = await this.prisma.zoneAdministrative.findUnique({
        where: { id: dto.zoneId },
      });
      if (!zone) {
        throw new NotFoundException('Zone introuvable.');
      }
      data.zone = { connect: { id: dto.zoneId } };
    }
    if (dto.latitude !== undefined) {
      data.latitude = dto.latitude;
    }
    if (dto.longitude !== undefined) {
      data.longitude = dto.longitude;
    }
    this.listCache.clear();
    return this.prisma.centreSante.update({
      where: { id },
      data,
      ...centreWithZoneArgs,
    });
  }
}