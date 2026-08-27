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
import { ROLES } from '../../common/constants/roles';
import type { RoleName } from '../../common/constants/roles';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const INVITABLE_ROLES: readonly RoleName[] = [ROLES.MEDECIN, ROLES.LABORATOIRE];

const userSafeListArgs = {
  include: { role: true, centre: true },
  omit: {
    passwordHash: true,
    resetToken: true,
    passwordResetCode: true,
    passwordResetCodeExpiresAt: true,
    passwordResetAttempts: true,
    passwordResetToken: true,
    passwordResetTokenExpiresAt: true,
  },
} as const;

type UserSafe = Prisma.UtilisateurGetPayload<typeof userSafeListArgs>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async invite(dto: InviteUserDto) {
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
    if (!INVITABLE_ROLES.includes(role.name as RoleName)) {
      throw new BadRequestException(
        "Seuls les rôles « Médecin » et « Laboratoire » peuvent être créés via l'invitation.",
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

    const temporaryPassword = this.generateTemporaryPassword(12);
    const passwordHash = await bcrypt.hash(
      temporaryPassword,
      this.configService.get<number>('bcryptRounds') ?? 12,
    );
    const resetToken = crypto.randomBytes(32).toString('hex');

    const utilisateur = await this.prisma.utilisateur.create({
      data: {
        name: dto.name.trim(),
        email,
        phoneNumber: dto.phoneNumber,
        passwordHash,
        temporaryPassword: true,
        resetToken,
        isActive: true,
        roleId: role.id,
        centreId: dto.centreId,
      },
      ...userSafeListArgs,
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const activationLink = `${frontendUrl}/activate?token=${resetToken}`;

    await this.emailService.sendWelcomeEmail({
      to: utilisateur.email,
      name: utilisateur.name,
      tempPassword: temporaryPassword,
      activationLink,
    });

    return {
      user: utilisateur,
      temporaryPassword,
      activationLink,
    };
  }

  async listRoles() {
    return this.prisma.role.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async updateUser(id: number, dto: UpdateUserDto): Promise<UserSafe> {
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

    return this.prisma.utilisateur.update({
      where: { id },
      data,
      ...userSafeListArgs,
    });
  }

  async setUserStatus(id: number, isActive: boolean): Promise<UserSafe> {
    const existing = await this.prisma.utilisateur.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    return this.prisma.utilisateur.update({
      where: { id },
      data: { isActive },
      ...userSafeListArgs,
    });
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

  private generateTemporaryPassword(length = 12): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%&*?';
    const all = upper + lower + digits + symbols;

    const chars = [
      upper[crypto.randomInt(upper.length)],
      lower[crypto.randomInt(lower.length)],
      digits[crypto.randomInt(digits.length)],
      symbols[crypto.randomInt(symbols.length)],
    ];

    for (let i = chars.length; i < length; i++) {
      chars.push(all[crypto.randomInt(all.length)]);
    }

    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
  }
}
