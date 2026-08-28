import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ActivityLogService } from '../../core/activity-log/activity-log.service';
import { EmailService } from '../email/email.service';
import { SessionsService } from './sessions.service';
import type { JwtPayload } from './jwt.strategy';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const ACTIVATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 h

const userSafeArgs = {
  include: { role: true, centre: true },
  omit: { passwordHash: true, resetToken: true },
} as const;

type UserSafe = Prisma.UtilisateurGetPayload<typeof userSafeArgs>;

const userWithPasswordArgs = {
  include: { role: true, centre: true },
} as const;

const userSafeWithZoneArgs = {
  include: {
    role: true,
    centre: { include: { zone: true } },
    region: true,
  },
  omit: { passwordHash: true, resetToken: true },
} as const;

type UserSafeWithZone = Prisma.UtilisateurGetPayload<
  typeof userSafeWithZoneArgs
>;

export interface AuthResult {
  token: string;
  user: UserSafe | UserSafeWithZone;
}

export interface LoginResult extends AuthResult {
  expiresIn: number;
}

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly sessionsService: SessionsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async login(dto: LoginDto, meta?: RequestMeta): Promise<LoginResult> {
    const email = dto.email.toLowerCase().trim();

    const recentFailures = await this.prisma.loginAttempt.count({
      where: {
        email,
        success: false,
        date: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
      },
    });

    if (recentFailures >= MAX_FAILED_ATTEMPTS) {
      throw new HttpException(
        'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email },
      ...userWithPasswordArgs,
    });

    if (!utilisateur || !utilisateur.isActive) {
      await this.recordAttempt(email, meta?.ip, false);
      throw new UnauthorizedException(
        'Identifiants invalides ou compte désactivé.',
      );
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      utilisateur.passwordHash,
    );
    if (!passwordValid) {
      await this.recordAttempt(email, meta?.ip, false);
      throw new UnauthorizedException('Identifiants invalides.');
    }

    await this.recordAttempt(email, meta?.ip, true);

    const rememberMe = dto.rememberMe === true;
    const expiresIn = rememberMe
      ? (this.configService.get<number>('jwt.rememberMeExpiresIn') ?? 2592000)
      : (this.configService.get<number>('jwt.expiresIn') ?? 86400);

    const token = await this.issueToken(utilisateur, expiresIn, meta);

    const { passwordHash, resetToken, ...user } = utilisateur;
    void passwordHash;
    void resetToken;

    await this.activityLog.log({
      userId: utilisateur.id,
      action: 'auth.login',
      resource: 'auth',
      detail: 'Connexion réussie',
      ip: meta?.ip,
    });

    return { token, user, expiresIn };
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

  async refresh(userId: number, meta?: RequestMeta): Promise<AuthResult> {
    const utilisateur = await this.getMe(userId);
    const token = await this.issueToken(utilisateur, undefined, meta);
    return { token, user: utilisateur };
  }

  async changePassword(
    userId: number,
    dto: ChangePasswordDto,
    meta?: RequestMeta,
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

    const token = await this.issueToken(updated, undefined, meta);

    await this.activityLog.log({
      userId,
      action: 'auth.changePassword',
      resource: 'auth',
      detail: 'Mot de passe modifié',
      ip: meta?.ip,
    });

    return { token, user: updated };
  }

  async activateAccount(
    dto: ActivateAccountDto,
    meta?: RequestMeta,
  ): Promise<AuthResult> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { resetToken: this.hashToken(dto.token) },
      ...userSafeArgs,
    });

    if (!utilisateur) {
      throw new BadRequestException(
        "Lien d'activation invalide ou déjà utilisé.",
      );
    }

    if (this.isTokenExpired(utilisateur.resetTokenExpiresAt)) {
      throw new BadRequestException("Ce lien d'activation a expiré.");
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
        resetTokenExpiresAt: null,
        activatedAt: new Date(),
      },
      ...userSafeArgs,
    });

    const token = await this.issueToken(updated, undefined, meta);

    await this.activityLog.log({
      userId: utilisateur.id,
      action: 'auth.activate',
      resource: 'auth',
      detail: 'Compte activé',
      ip: meta?.ip,
    });

    return { token, user: updated };
  }

  async activationInfo(token: string): Promise<{ email: string }> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { resetToken: this.hashToken(token) },
      select: { email: true, resetTokenExpiresAt: true },
    });

    if (!utilisateur) {
      throw new BadRequestException(
        "Lien d'activation invalide ou déjà utilisé.",
      );
    }
    if (this.isTokenExpired(utilisateur.resetTokenExpiresAt)) {
      throw new BadRequestException("Ce lien d'activation a expiré.");
    }

    return { email: utilisateur.email };
  }

  async resendActivation(emailRaw: string): Promise<{ message: string }> {
    const email = emailRaw.toLowerCase().trim();
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email },
    });

    if (
      !utilisateur ||
      !utilisateur.isActive ||
      utilisateur.activatedAt !== null
    ) {
      return {
        message:
          'Si un compte en attente d’activation est associé à cette adresse, un nouveau lien vient d’être envoyé.',
      };
    }

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: {
        resetToken: this.hashToken(token),
        resetTokenExpiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS),
      },
    });

    await this.sendActivationEmail(utilisateur.email, utilisateur.name, token);

    return {
      message:
        'Si un compte en attente d’activation est associé à cette adresse, un nouveau lien vient d’être envoyé.',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase().trim();
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email },
    });

    if (!utilisateur || !utilisateur.isActive) {
      return {
        message:
          'Si un compte est associé à cette adresse e-mail, un lien de réinitialisation vient d’être envoyé.',
      };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: {
        resetToken: this.hashToken(resetToken),
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    await this.sendPasswordResetEmail(
      utilisateur.email,
      utilisateur.name,
      resetToken,
    );

    await this.activityLog.log({
      userId: utilisateur.id,
      action: 'auth.forgotPassword',
      resource: 'auth',
      detail: 'Demande de réinitialisation du mot de passe',
    });

    return {
      message:
        'Si un compte est associé à cette adresse e-mail, un lien de réinitialisation vient d’être envoyé.',
    };
  }

  async resetPassword(
    dto: ResetPasswordDto,
    meta?: RequestMeta,
  ): Promise<AuthResult> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { resetToken: this.hashToken(dto.token) },
      ...userSafeArgs,
    });

    if (!utilisateur) {
      throw new BadRequestException(
        'Lien de réinitialisation invalide ou déjà utilisé.',
      );
    }

    if (this.isTokenExpired(utilisateur.resetTokenExpiresAt)) {
      throw new BadRequestException('Ce lien de réinitialisation a expiré.');
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
        resetTokenExpiresAt: null,
      },
      ...userSafeArgs,
    });

    const token = await this.issueToken(updated, undefined, meta);

    await this.activityLog.log({
      userId: utilisateur.id,
      action: 'auth.resetPassword',
      resource: 'auth',
      detail: 'Mot de passe réinitialisé',
      ip: meta?.ip,
    });

    return { token, user: updated };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private isTokenExpired(expiresAt: Date | string | null | undefined): boolean {
    if (expiresAt === null || expiresAt === undefined) {
      return false;
    }
    const expiryTime = new Date(expiresAt).getTime();
    return Number.isFinite(expiryTime) && expiryTime < Date.now();
  }

  private async sendActivationEmail(
    to: string,
    name: string,
    token: string,
  ): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('frontendUrl') ?? 'http://localhost:3000';
    const activationLink = `${frontendUrl}/activate?token=${token}`;
    await this.emailService.sendActivationEmail({ to, name, activationLink });
  }

  private async sendPasswordResetEmail(
    to: string,
    name: string,
    token: string,
  ): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('frontendUrl') ?? 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;
    await this.emailService.sendPasswordResetEmail({ to, name, resetLink });
  }

  async logout(jti: string): Promise<void> {
    if (jti) {
      await this.sessionsService.revoke(jti);
    }
  }

  private async recordAttempt(
    email: string,
    ip?: string | null,
    success = false,
  ) {
    try {
      await this.prisma.loginAttempt.create({
        data: { email, ip: ip ?? null, success },
      });
    } catch {
      // l'enregistrement des tentatives ne doit pas bloquer la connexion
    }
  }

  private async issueToken(
    utilisateur: Pick<
      UserSafe,
      'id' | 'email' | 'roleId' | 'temporaryPassword'
    > & { role: { name: string } },
    expiresIn?: number,
    meta?: RequestMeta,
  ): Promise<string> {
    const duration =
      expiresIn ?? this.configService.get<number>('jwt.expiresIn') ?? 86400;

    const jti = await this.sessionsService.create(
      utilisateur.id,
      duration,
      meta?.ip,
      meta?.userAgent,
    );

    return this.signToken(utilisateur, duration, jti);
  }

  private async signToken(
    utilisateur: Pick<
      UserSafe,
      'id' | 'email' | 'roleId' | 'temporaryPassword'
    > & {
      role: { name: string };
    },
    expiresIn: number,
    jti: string,
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: String(utilisateur.id),
      id_role: utilisateur.roleId,
      role: utilisateur.role.name,
      email: utilisateur.email,
      tempPassword: utilisateur.temporaryPassword,
      jti,
    };

    return this.jwtService.signAsync(payload, { expiresIn });
  }
}
