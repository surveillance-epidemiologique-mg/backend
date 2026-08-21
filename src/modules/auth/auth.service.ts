import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { JwtPayload } from './jwt.strategy';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';

const userSafeArgs = {
  include: { role: true, centre: true },
  omit: { passwordHash: true, resetToken: true },
} as const;

type UserSafe = Prisma.UtilisateurGetPayload<typeof userSafeArgs>;

const userWithPasswordArgs = {
  include: { role: true, centre: true },
} as const;

const userSafeWithZoneArgs = {
  include: { role: true, centre: { include: { zone: true } } },
  omit: { passwordHash: true, resetToken: true },
} as const;

type UserSafeWithZone = Prisma.UtilisateurGetPayload<
  typeof userSafeWithZoneArgs
>;

export interface AuthResult {
  token: string;
  user: UserSafe | UserSafeWithZone;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResult> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      ...userWithPasswordArgs,
    });

    if (!utilisateur || !utilisateur.isActive) {
      throw new UnauthorizedException(
        'Identifiants invalides ou compte désactivé.',
      );
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      utilisateur.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const token = await this.signToken(utilisateur);

    const { passwordHash, resetToken, ...user } = utilisateur;
    void passwordHash;
    void resetToken;

    return { token, user };
  }

  async getMe(userId: number): Promise<UserSafeWithZone> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: userId },
      ...userSafeWithZoneArgs,
    });

    if (!utilisateur) {
      throw new UnauthorizedException('Utilisateur introuvable.');
    }

    return utilisateur;
  }

  async changePassword(
    userId: number,
    dto: ChangePasswordDto,
  ): Promise<AuthResult> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: userId },
      ...userWithPasswordArgs,
    });

    if (!utilisateur) {
      throw new UnauthorizedException('Utilisateur introuvable.');
    }

    const currentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      utilisateur.passwordHash,
    );
    if (!currentPasswordValid) {
      throw new BadRequestException('Le mot de passe actuel est incorrect.');
    }

    const newHash = await bcrypt.hash(
      dto.newPassword,
      this.configService.get<number>('bcryptRounds') ?? 12,
    );

    const updated = await this.prisma.utilisateur.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        temporaryPassword: false,
        resetToken: null,
      },
      ...userSafeArgs,
    });

    const token = await this.signToken(updated);
    return { token, user: updated };
  }

  async activateAccount(dto: ActivateAccountDto): Promise<AuthResult> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { resetToken: dto.token },
      ...userSafeArgs,
    });

    if (!utilisateur) {
      throw new BadRequestException(
        "Lien d'activation invalide ou déjà utilisé.",
      );
    }

    const newHash = await bcrypt.hash(
      dto.newPassword,
      this.configService.get<number>('bcryptRounds') ?? 12,
    );

    const updated = await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: {
        passwordHash: newHash,
        temporaryPassword: false,
        resetToken: null,
      },
      ...userSafeArgs,
    });

    const token = await this.signToken(updated);
    return { token, user: updated };
  }

  private async signToken(
    utilisateur: Pick<
      UserSafe,
      'id' | 'email' | 'roleId' | 'temporaryPassword'
    > & {
      role: { name: string };
    },
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: utilisateur.id,
      id_role: utilisateur.roleId,
      role: utilisateur.role.name,
      email: utilisateur.email,
      tempPassword: utilisateur.temporaryPassword,
    };

    return this.jwtService.signAsync(payload);
  }
}
