import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ActivityLogService } from '../../core/activity-log/activity-log.service';
import { ROLES } from '../../common/constants/roles';
import { StatutSignalement, TypeZone } from '../../../generated/prisma/enums';
import { CreateSignalementDto } from './dto/create-signalement.dto';
import { UpdateSignalementDto } from './dto/update-signalement.dto';

const signalementInclude = {
  include: {
    maladie: true,
    region: true,
    district: true,
    centre: { include: { zone: { include: { parent: true } } } },
    createur: { omit: { passwordHash: true, resetToken: true } },
    decideur: { omit: { passwordHash: true, resetToken: true } },
  },
} as const;

type SignalementWithRelations = Prisma.SignalementGetPayload<
  typeof signalementInclude
>;

@Injectable()
export class SignalementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async options() {
    const maladies = await this.prisma.maladie.findMany({
      orderBy: { name: 'asc' },
    });

    const regions = await this.prisma.zoneAdministrative.findMany({
      where: { type: TypeZone.Region },
      orderBy: { name: 'asc' },
      include: {
        children: {
          where: { type: TypeZone.District },
          orderBy: { name: 'asc' },
          include: {
            centres: {
              orderBy: { name: 'asc' },
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return {
      maladies,
      regions: regions.map((region) => ({
        id: region.id,
        name: region.name,
        districts: region.children.map((district) => ({
          id: district.id,
          name: district.name,
          centres: district.centres,
        })),
      })),
    };
  }

  async create(userId: number, dto: CreateSignalementDto) {
    const user = await this.getUser(userId);

    if (!this.hasGlobalScope(user)) {
      this.ensureCreateScope(user, dto.regionId, dto.centreId);
    }

    await this.validateReferences(dto);

    if ((dto.nbCasSuspects ?? 0) + (dto.nbCasConfirmes ?? 0) === 0) {
      throw new BadRequestException(
        'Le signalement doit contenir au moins un cas suspect ou confirmé.',
      );
    }

    const signalement = await this.prisma.signalement.create({
      data: {
        maladieId: dto.maladieId,
        regionId: dto.regionId,
        districtId: dto.districtId,
        centreId: dto.centreId,
        dateSignalement: new Date(dto.dateSignalement),
        nbCasSuspects: dto.nbCasSuspects ?? 0,
        nbCasConfirmes: dto.nbCasConfirmes ?? 0,
        nbDeces: dto.nbDeces ?? 0,
        nbGueris: dto.nbGueris ?? 0,
        statut: StatutSignalement.Brouillon,
        createdById: userId,
      },
      ...signalementInclude,
    });

    await this.activityLog.log({
      userId,
      action: 'signalement.create',
      resource: 'signalement',
      resourceId: signalement.id,
      detail: `Signalement créé (${signalement.maladie.name})`,
    });

    return signalement;
  }

  async list(userId: number): Promise<SignalementWithRelations[]> {
    const user = await this.getUser(userId);

    let where: Prisma.SignalementWhereInput = {};
    if (!this.hasGlobalScope(user)) {
      if (user.regionId) {
        where.centre = { zone: { parentId: user.regionId } };
      } else if (user.centreId) {
        where = { centreId: user.centreId };
      } else {
        where = { createdById: userId };
      }
    }

    return this.prisma.signalement.findMany({
      where,
      ...signalementInclude,
      orderBy: [{ statut: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: number, id: number): Promise<SignalementWithRelations> {
    const signalement = await this.prisma.signalement.findUnique({
      where: { id },
      ...signalementInclude,
    });
    if (!signalement) {
      throw new NotFoundException('Signalement introuvable.');
    }

    await this.ensureReadScope(userId, signalement);
    return signalement;
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateSignalementDto,
  ): Promise<SignalementWithRelations> {
    const signalement = await this.getEditable(userId, id);

    await this.validateReferences(dto);

    const total =
      (dto.nbCasSuspects ?? signalement.nbCasSuspects) +
      (dto.nbCasConfirmes ?? signalement.nbCasConfirmes);
    if (total === 0) {
      throw new BadRequestException(
        'Le signalement doit contenir au moins un cas suspect ou confirmé.',
      );
    }

    const data: Prisma.SignalementUpdateInput = {};
    if (dto.maladieId !== undefined)
      data.maladie = { connect: { id: dto.maladieId } };
    if (dto.regionId !== undefined)
      data.region = { connect: { id: dto.regionId } };
    if (dto.districtId !== undefined)
      data.district = { connect: { id: dto.districtId } };
    if (dto.centreId !== undefined)
      data.centre = { connect: { id: dto.centreId } };
    if (dto.dateSignalement !== undefined)
      data.dateSignalement = new Date(dto.dateSignalement);
    if (dto.nbCasSuspects !== undefined) data.nbCasSuspects = dto.nbCasSuspects;
    if (dto.nbCasConfirmes !== undefined)
      data.nbCasConfirmes = dto.nbCasConfirmes;
    if (dto.nbDeces !== undefined) data.nbDeces = dto.nbDeces;
    if (dto.nbGueris !== undefined) data.nbGueris = dto.nbGueris;

    const updated = await this.prisma.signalement.update({
      where: { id },
      data,
      ...signalementInclude,
    });

    await this.activityLog.log({
      userId,
      action: 'signalement.update',
      resource: 'signalement',
      resourceId: id,
      detail: `Signalement ${id} modifié`,
    });

    return updated;
  }

  async submit(userId: number, id: number): Promise<SignalementWithRelations> {
    const signalement = await this.getEditable(userId, id);

    if (signalement.statut !== StatutSignalement.Brouillon) {
      throw new BadRequestException(
        'Seul un signalement en brouillon peut être soumis.',
      );
    }

    const updated = await this.prisma.signalement.update({
      where: { id },
      data: { statut: StatutSignalement.EnAttente },
      ...signalementInclude,
    });

    await this.activityLog.log({
      userId,
      action: 'signalement.submit',
      resource: 'signalement',
      resourceId: id,
      detail: 'Signalement soumis pour validation',
    });

    return updated;
  }

  async validate(
    userId: number,
    id: number,
  ): Promise<SignalementWithRelations> {
    const user = await this.getUser(userId);
    this.requireGlobalScope(user);

    const signalement = await this.prisma.signalement.findUnique({
      where: { id },
    });
    if (!signalement) {
      throw new NotFoundException('Signalement introuvable.');
    }
    if (signalement.statut !== StatutSignalement.EnAttente) {
      throw new BadRequestException(
        'Seul un signalement en attente peut être validé.',
      );
    }

    const updated = await this.prisma.signalement.update({
      where: { id },
      data: {
        statut: StatutSignalement.Valide,
        decidedById: userId,
        decidedAt: new Date(),
      },
      ...signalementInclude,
    });

    await this.activityLog.log({
      userId,
      action: 'signalement.validate',
      resource: 'signalement',
      resourceId: id,
      detail: 'Signalement validé',
    });

    return updated;
  }

  async reject(userId: number, id: number): Promise<SignalementWithRelations> {
    const user = await this.getUser(userId);
    this.requireGlobalScope(user);

    const signalement = await this.prisma.signalement.findUnique({
      where: { id },
    });
    if (!signalement) {
      throw new NotFoundException('Signalement introuvable.');
    }
    if (signalement.statut !== StatutSignalement.EnAttente) {
      throw new BadRequestException(
        'Seul un signalement en attente peut être rejeté.',
      );
    }

    const updated = await this.prisma.signalement.update({
      where: { id },
      data: {
        statut: StatutSignalement.Rejete,
        decidedById: userId,
        decidedAt: new Date(),
      },
      ...signalementInclude,
    });

    await this.activityLog.log({
      userId,
      action: 'signalement.reject',
      resource: 'signalement',
      resourceId: id,
      detail: 'Signalement rejeté',
    });

    return updated;
  }

  // ---- Helpers ----

  private async getUser(userId: number) {
    const user = await this.prisma.utilisateur.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable.');
    }
    return user;
  }

  private isGlobalRole(roleName: string): boolean {
    return (
      roleName === ROLES.ADMINISTRATEUR ||
      roleName === ROLES.RESPONSABLE_NATIONAL
    );
  }

  private hasGlobalScope(user: { role: { name: string } }): boolean {
    return this.isGlobalRole(user.role.name);
  }

  private requireGlobalScope(user: { role: { name: string } }) {
    if (!this.hasGlobalScope(user)) {
      throw new ForbiddenException(
        'Seuls les rôles nationaux peuvent valider ou rejeter un signalement.',
      );
    }
  }

  private signalementRegionId(
    signalement: SignalementWithRelations,
  ): number | null {
    return signalement.centre?.zone?.parentId ?? null;
  }

  private ensureCreateScope(
    user: { centreId: number | null; regionId: number | null },
    regionId: number,
    centreId: number,
  ) {
    if (user.regionId) {
      if (user.regionId !== regionId) {
        throw new ForbiddenException(
          'Vous ne pouvez créer un signalement que dans votre région.',
        );
      }
      return;
    }
    if (user.centreId) {
      if (user.centreId !== centreId) {
        throw new ForbiddenException(
          'Vous ne pouvez créer un signalement que pour votre propre établissement.',
        );
      }
      return;
    }
    throw new ForbiddenException(
      'Vous n’avez pas de périmètre d’action défini.',
    );
  }

  private async ensureReadScope(
    userId: number,
    signalement: SignalementWithRelations,
  ) {
    const user = await this.getUser(userId);
    if (this.hasGlobalScope(user)) {
      return;
    }

    let inScope = signalement.createdById === userId;
    if (user.regionId) {
      inScope =
        inScope || this.signalementRegionId(signalement) === user.regionId;
    } else if (user.centreId) {
      inScope = inScope || signalement.centreId === user.centreId;
    }

    if (!inScope) {
      throw new NotFoundException('Signalement introuvable.');
    }
  }

  private async getEditable(userId: number, id: number) {
    const signalement = await this.prisma.signalement.findUnique({
      where: { id },
      ...signalementInclude,
    });
    if (!signalement) {
      throw new NotFoundException('Signalement introuvable.');
    }

    const user = await this.getUser(userId);
    if (!this.hasGlobalScope(user)) {
      let inScope = signalement.createdById === userId;
      if (user.regionId) {
        inScope =
          inScope ||
          (this.signalementRegionId(signalement) === user.regionId &&
            signalement.createdById === userId);
      } else if (user.centreId) {
        inScope = inScope && signalement.centreId === user.centreId;
      }

      if (!inScope) {
        throw new ForbiddenException(
          'Vous ne pouvez modifier que les signalements de votre périmètre.',
        );
      }
    }

    if (signalement.statut === StatutSignalement.Valide) {
      throw new BadRequestException(
        'Un signalement validé ne peut plus être modifié.',
      );
    }

    return signalement;
  }

  private async validateReferences(dto: {
    maladieId?: number;
    regionId?: number;
    districtId?: number;
    centreId?: number;
  }) {
    if (dto.maladieId !== undefined) {
      const maladie = await this.prisma.maladie.findUnique({
        where: { id: dto.maladieId },
      });
      if (!maladie) {
        throw new BadRequestException('Maladie introuvable.');
      }
    }

    if (dto.regionId !== undefined) {
      const region = await this.prisma.zoneAdministrative.findUnique({
        where: { id: dto.regionId },
      });
      if (!region || region.type !== TypeZone.Region) {
        throw new BadRequestException('Région invalide.');
      }
    }

    if (dto.districtId !== undefined) {
      const district = await this.prisma.zoneAdministrative.findUnique({
        where: { id: dto.districtId },
      });
      if (!district || district.type !== TypeZone.District) {
        throw new BadRequestException('District invalide.');
      }
      if (dto.regionId !== undefined && district.parentId !== dto.regionId) {
        throw new BadRequestException(
          'Le district n’appartient pas à la région sélectionnée.',
        );
      }
    }

    if (dto.centreId !== undefined) {
      const centre = await this.prisma.centreSante.findUnique({
        where: { id: dto.centreId },
        include: { zone: true },
      });
      if (!centre) {
        throw new BadRequestException('Établissement introuvable.');
      }
      if (dto.districtId !== undefined && centre.zoneId !== dto.districtId) {
        throw new BadRequestException(
          'L’établissement n’appartient pas au district sélectionné.',
        );
      }
    }
  }
}
