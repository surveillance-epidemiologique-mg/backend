import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ActivityLogService } from '../../core/activity-log/activity-log.service';
import { TypeZone } from '../../../generated/prisma/enums';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

const ZONE_LEVEL: Record<TypeZone, number> = {
  [TypeZone.Region]: 0,
  [TypeZone.District]: 1,
  [TypeZone.Commune]: 2,
  [TypeZone.Fokontany]: 3,
};

@Injectable()
export class ZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  list() {
    return this.prisma.zoneAdministrative.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        parent: true,
        children: { select: { id: true, name: true, type: true } },
      },
    });
  }

  async create(userId: number, dto: CreateZoneDto) {
    await this.validateParent(dto.parentId, dto.type);

    let zone: Prisma.ZoneAdministrativeGetPayload<{
      include: { parent: true };
    }>;
    try {
      zone = await this.prisma.zoneAdministrative.create({
        data: {
          name: dto.name.trim(),
          type: dto.type,
          pcode: dto.pcode?.trim() || null,
          parentId: dto.parentId ?? null,
        },
        include: { parent: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Un code PCODE identique existe déjà.');
      }
      throw error;
    }

    await this.activityLog.log({
      userId,
      action: 'zone.create',
      resource: 'zone',
      resourceId: zone.id,
      detail: `Création de la zone « ${zone.name} » (${zone.type})`,
    });

    return zone;
  }

  async update(userId: number, id: number, dto: UpdateZoneDto) {
    const existing = await this.prisma.zoneAdministrative.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Zone introuvable.');
    }

    const parentId =
      dto.parentId !== undefined ? dto.parentId : existing.parentId;
    const type = dto.type ?? existing.type;
    await this.validateParent(parentId ?? undefined, type);

    const data: Prisma.ZoneAdministrativeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.pcode !== undefined) data.pcode = dto.pcode?.trim() || null;
    if (dto.parentId !== undefined) {
      data.parent = dto.parentId
        ? { connect: { id: dto.parentId } }
        : { disconnect: true };
    }

    const zone = await this.prisma.zoneAdministrative.update({
      where: { id },
      data,
      include: { parent: true },
    });

    await this.activityLog.log({
      userId,
      action: 'zone.update',
      resource: 'zone',
      resourceId: id,
      detail: `Modification de la zone « ${zone.name} »`,
    });

    return zone;
  }

  private async validateParent(parentId: number | undefined, type: TypeZone) {
    if (parentId === undefined) {
      return;
    }
    const parent = await this.prisma.zoneAdministrative.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      throw new BadRequestException('Zone parente introuvable.');
    }
    if (ZONE_LEVEL[parent.type] !== ZONE_LEVEL[type] - 1) {
      throw new BadRequestException(
        'La zone parente doit être du niveau immédiatement supérieur.',
      );
    }
  }
}
