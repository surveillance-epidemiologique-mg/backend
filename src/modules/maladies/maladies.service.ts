import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { TtlCache } from '../../common/cache/ttl-cache';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateMaladieDto } from './dto/create-maladie.dto';
import { UpdateMaladieDto } from './dto/update-maladie.dto';

@Injectable()
export class MaladiesService {
  private readonly listCache = new TtlCache<ReturnType<typeof this.list>>(
    60_000,
  );

  constructor(private readonly prisma: PrismaService) {}

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

  create(dto: CreateMaladieDto) {
    this.listCache.clear();
    return this.prisma.maladie.create({
      data: {
        name: dto.name.trim(),
        icd10Code: dto.icd10Code?.trim().toUpperCase() || null,
        alertThreshold: dto.alertThreshold,
        description: dto.description,
      },
    });
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
    if (dto.alertThreshold !== undefined) {
      data.alertThreshold = dto.alertThreshold;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    this.listCache.clear();
    return this.prisma.maladie.update({ where: { id }, data });
  }
}
