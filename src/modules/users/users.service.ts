import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ActivityLogService } from '../../core/activity-log/activity-log.service';
import { INVITABLE_ROLES } from '../../common/constants/roles';
import { TypeZone } from '../../../generated/prisma/enums';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const userSafeListArgs = {
  include: { role: true, centre: true, region: true },
  omit: { passwordHash: true, resetToken: true },
} as const;

type UserSafe = Prisma.UtilisateurGetPayload<typeof userSafeListArgs>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async invite(inviterId: number, dto: InviteUserDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.utilisateur.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException(
        'Un utilisateur avec cette adresse e-mail existe déjà.',
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!role) {
      throw new NotFoundException('Rôle introuvable.');
    }
    if (
      !INVITABLE_ROLES.includes(role.name as (typeof INVITABLE_ROLES)[number])
    ) {
      throw new BadRequestException(
        "Ce rôle ne peut pas être créé via l'invitation.",
      );
    }

    if (dto.centreId) {
      const centre = await this.prisma.centreSante.findUnique({
        where: { id: dto.centreId },
      });
      if (!centre) {
        throw new NotFoundException('Centre de santé introuvable.');
      }
    }

    if (dto.regionId) {
      const region = await this.prisma.zoneAdministrative.findUnique({
        where: { id: dto.regionId },
      });
      if (!region || region.type !== TypeZone.Region) {
        throw new BadRequestException('Région invalide.');
      }
    }

    const activationToken = crypto.randomBytes(32).toString('hex');
    const throwawayPassword = crypto.randomBytes(16).toString('base64url');
    const passwordHash = await bcrypt.hash(
      throwawayPassword,
      this.configService.get<number>('bcryptRounds') ?? 12,
    );
    const resetTokenHash = this.hashToken(activationToken);
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const utilisateur = await this.prisma.utilisateur.create({
      data: {
        name: this.composeName(dto),
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        email,
        phoneNumber: dto.phoneNumber,
        passwordHash,
        temporaryPassword: true,
        resetToken: resetTokenHash,
        resetTokenExpiresAt: tokenExpiresAt,
        isActive: dto.isActive ?? true,
        roleId: role.id,
        centreId: dto.centreId,
        regionId: dto.regionId,
      },
      ...userSafeListArgs,
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const activationLink = `${frontendUrl}/activate?token=${activationToken}`;

    await this.emailService.sendActivationEmail({
      to: utilisateur.email,
      name: utilisateur.name,
      activationLink,
    });

    await this.activityLog.log({
      userId: inviterId,
      action: 'user.invite',
      resource: 'user',
      resourceId: utilisateur.id,
      detail: `Invitation de ${utilisateur.email} (rôle ${role.name})`,
    });

    return {
      user: utilisateur,
      activationLink,
    };
  }

  async resendInvitation(
    actorId: number,
    id: number,
  ): Promise<{ message: string; activationLink: string }> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id },
    });
    if (!utilisateur) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    if (!utilisateur.isActive) {
      throw new ConflictException(
        'Impossible de renvoyer une invitation sur un compte désactivé.',
      );
    }
    if (utilisateur.activatedAt !== null) {
      throw new ConflictException(
        'Ce compte a déjà été activé : aucun lien à renvoyer.',
      );
    }

    const activationToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.utilisateur.update({
      where: { id },
      data: {
        resetToken: this.hashToken(activationToken),
        resetTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const activationLink = `${frontendUrl}/activate?token=${activationToken}`;

    await this.emailService.sendActivationEmail({
      to: utilisateur.email,
      name: utilisateur.name,
      activationLink,
    });

    await this.activityLog.log({
      userId: actorId,
      action: 'user.resendInvitation',
      resource: 'user',
      resourceId: id,
      detail: `Renvoyer l'invitation à ${utilisateur.email}`,
    });

    return { message: 'Invitation renvoyée.', activationLink };
  }

  async listRoles() {
    return this.prisma.role.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async updateUser(
    actorId: number,
    id: number,
    dto: UpdateUserDto,
  ): Promise<UserSafe> {
    const existing = await this.prisma.utilisateur.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    const data: Prisma.UtilisateurUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      data.firstName = dto.firstName ?? existing.firstName;
      data.lastName = dto.lastName ?? existing.lastName;
      const firstName = data.firstName ?? existing.firstName;
      const lastName = data.lastName ?? existing.lastName;
      if (firstName || lastName) {
        data.name = [firstName, lastName].filter(Boolean).join(' ');
      }
    }
    if (dto.phoneNumber !== undefined) {
      data.phoneNumber = dto.phoneNumber;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (dto.roleId !== undefined) {
      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
      });
      if (!role) {
        throw new NotFoundException('Rôle introuvable.');
      }
      data.role = { connect: { id: dto.roleId } };
    }
    if (dto.centreId !== undefined) {
      if (dto.centreId === null) {
        data.centre = { disconnect: true };
      } else {
        const centre = await this.prisma.centreSante.findUnique({
          where: { id: dto.centreId },
        });
        if (!centre) {
          throw new NotFoundException('Centre de santé introuvable.');
        }
        data.centre = { connect: { id: dto.centreId } };
      }
    }
    if (dto.regionId !== undefined) {
      if (dto.regionId === null) {
        data.region = { disconnect: true };
      } else {
        const region = await this.prisma.zoneAdministrative.findUnique({
          where: { id: dto.regionId },
        });
        if (!region || region.type !== TypeZone.Region) {
          throw new BadRequestException('Région invalide.');
        }
        data.region = { connect: { id: dto.regionId } };
      }
    }

    const utilisateur = await this.prisma.utilisateur.update({
      where: { id },
      data,
      ...userSafeListArgs,
    });

    await this.activityLog.log({
      userId: actorId,
      action: 'user.update',
      resource: 'user',
      resourceId: id,
      detail: `Modification du compte ${utilisateur.email}`,
    });

    return utilisateur;
  }

  async setUserStatus(
    actorId: number,
    id: number,
    isActive: boolean,
  ): Promise<UserSafe> {
    const existing = await this.prisma.utilisateur.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    const utilisateur = await this.prisma.utilisateur.update({
      where: { id },
      data: { isActive },
      ...userSafeListArgs,
    });

    await this.activityLog.log({
      userId: actorId,
      action: 'user.status',
      resource: 'user',
      resourceId: id,
      detail: `Compte ${utilisateur.email} ${isActive ? 'activé' : 'désactivé'}`,
    });

    return utilisateur;
  }

  async remove(actorId: number, id: number): Promise<{ message: string }> {
    if (id === actorId) {
      throw new BadRequestException(
        'Vous ne pouvez pas supprimer votre propre compte.',
      );
    }

    const existing = await this.prisma.utilisateur.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    const [
      casDeclares,
      signalementsCrees,
      signalementsDecides,
      alertesCrees,
      alertesAssignees,
      alertesResolues,
    ] = await Promise.all([
      this.prisma.casEpidemiologique.count({
        where: { agentId: id },
      }),
      this.prisma.signalement.count({ where: { createdById: id } }),
      this.prisma.signalement.count({ where: { decidedById: id } }),
      this.prisma.alerte.count({ where: { createdById: id } }),
      this.prisma.alerte.count({ where: { assigneeId: id } }),
      this.prisma.alerte.count({ where: { resolvedById: id } }),
    ]);

    const linked =
      casDeclares +
      signalementsCrees +
      signalementsDecides +
      alertesCrees +
      alertesAssignees +
      alertesResolues;

    if (linked > 0) {
      throw new ConflictException(
        `Impossible de supprimer : ${linked} élément(s) de données sont lié(s) à ce compte. Désactivez-le à la place.`,
      );
    }

    await this.prisma.sessionToken.deleteMany({ where: { userId: id } });
    await this.prisma.utilisateur.delete({ where: { id } });

    await this.activityLog.log({
      userId: actorId,
      action: 'user.delete',
      resource: 'user',
      resourceId: id,
      detail: `Compte ${existing.email} supprimé`,
    });

    return { message: 'Utilisateur supprimé.' };
  }

  async listCentres() {
    return this.prisma.centreSante.findMany({
      include: { zone: true },
      orderBy: { name: 'asc' },
    });
  }

  async listUsers(): Promise<UserSafe[]> {
    return this.prisma.utilisateur.findMany({
      ...userSafeListArgs,
      orderBy: { id: 'desc' },
    });
  }

  // ---- Helpers ----

  private composeName(dto: {
    name: string;
    firstName?: string;
    lastName?: string;
  }): string {
    if (dto.firstName && dto.lastName) {
      return `${dto.firstName.trim()} ${dto.lastName.trim()}`;
    }
    if (dto.firstName || dto.lastName) {
      return (dto.firstName ?? dto.lastName)!.trim();
    }
    return dto.name.trim();
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
