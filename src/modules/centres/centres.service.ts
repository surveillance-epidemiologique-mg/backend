import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateCentreDto } from './dto/create-centre.dto';
import { UpdateCentreDto } from './dto/update-centre.dto';

const centreWithZoneArgs = {
  include: { zone: true },
} as const;

@Injectable()
export class CentresService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.centreSante.findMany({
      ...centreWithZoneArgs,
      orderBy: { name: 'asc' },
    });
  }

  listZones() {
    return this.prisma.zoneAdministrative.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateCentreDto) {
    const zone = await this.prisma.zoneAdministrative.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone) {
      throw new NotFoundException('Zone introuvable.');
    }

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
    return this.prisma.centreSante.update({
      where: { id },
      data,
      ...centreWithZoneArgs,
    });
  }
}
