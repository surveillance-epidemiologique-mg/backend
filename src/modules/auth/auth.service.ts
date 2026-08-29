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
import { EmailService } from '../email/email.service';
import type { JwtPayload } from './jwt.strategy';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const SENSITIVE_FIELDS = {
  passwordHash: true,
  resetToken: true,
  passwordResetCode: true,
  passwordResetCodeExpiresAt: true,
  passwordResetAttempts: true,
  passwordResetToken: true,
  passwordResetTokenExpiresAt: true,
} as const;

const PASSWORD_RESET_CODE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

const userSafeArgs = {
  include: { role: true, centre: true },
  omit: SENSITIVE_FIELDS,
} as const;

type UserSafe = Prisma.UtilisateurGetPayload<typeof userSafeArgs>;

const userWithPasswordArgs = {
  include: { role: true, centre: true },
  omit: {
    resetToken: true,
    passwordResetCode: true,
    passwordResetCodeExpiresAt: true,
    passwordResetAttempts: true,
    passwordResetToken: true,
    passwordResetTokenExpiresAt: true,
  },
} as const;

const userSafeWithZoneArgs = {
  include: {
    role: true,
    centre: { include: { zone: true } },
    region: true,
  },
  omit: SENSITIVE_FIELDS,
} as const;

type UserSafeWithZone = Prisma.UtilisateurGetPayload<
  typeof userSafeWithZoneArgs
>;

type TokenSubject = Pick<
  UserSafe,
  'id' | 'email' | 'roleId' | 'temporaryPassword'
> & { role: { name: string } };

export interface AuthResult {
  token: string;
  user: UserSafe | UserSafeWithZone;
}

export interface LoginResult extends AuthResult {
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const email = dto.email.toLowerCase().trim();

    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email },
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

    const rememberMe = dto.rememberMe === true;
    const expiresIn = rememberMe
      ? (this.configService.get<number>('jwt.rememberMeExpiresIn') ?? 2592000)
      : (this.configService.get<number>('jwt.expiresIn') ?? 86400);

    const token = await this.signToken(utilisateur, expiresIn);

    const { passwordHash, ...user } = utilisateur;
    void passwordHash;

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

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ success: boolean; message?: string }> {
    const email = dto.email.toLowerCase().trim();
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email },
    });

    if (!utilisateur || !utilisateur.isActive) {
      return {
        success: false,
        message: "Aucun compte n'est associé à cette adresse e-mail.",
      };
    }

    const code = this.generateNumericCode(6);
    const codeHash = this.hashValue(code);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_CODE_TTL_MS);

    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: {
        passwordResetCode: codeHash,
        passwordResetCodeExpiresAt: expiresAt,
        passwordResetAttempts: 0,
      },
    });

    await this.emailService.sendPasswordResetEmail({
      to: utilisateur.email,
      name: utilisateur.name,
      code,
    });

    return { success: true };
  }

  async verifyResetCode(
    dto: VerifyResetCodeDto,
  ): Promise<{ resetToken: string }> {
    const email = dto.email.toLowerCase().trim();
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email },
    });

    if (
      !utilisateur ||
      !utilisateur.isActive ||
      !utilisateur.passwordResetCode ||
      !utilisateur.passwordResetCodeExpiresAt ||
      utilisateur.passwordResetCodeExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Code invalide ou expiré.');
    }

    if (utilisateur.passwordResetAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      throw new HttpException(
        'Trop de tentatives. Veuillez demander un nouveau code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (this.hashValue(dto.code) !== utilisateur.passwordResetCode) {
      await this.prisma.utilisateur.update({
        where: { id: utilisateur.id },
        data: { passwordResetAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Code invalide.');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashValue(resetToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: {
        passwordResetCode: null,
        passwordResetCodeExpiresAt: null,
        passwordResetAttempts: 0,
        passwordResetToken: tokenHash,
        passwordResetTokenExpiresAt: expiresAt,
      },
    });

    return { resetToken };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ success: boolean }> {
    const tokenHash = this.hashValue(dto.token);
    const utilisateur = await this.prisma.utilisateur.findFirst({
      where: { passwordResetToken: tokenHash },
    });

    if (
      !utilisateur ||
      !utilisateur.passwordResetTokenExpiresAt ||
      utilisateur.passwordResetTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'Jeton de réinitialisation invalide ou expiré.',
      );
    }

    const newHash = await bcrypt.hash(
      dto.newPassword,
      this.configService.get<number>('bcryptRounds') ?? 12,
    );

    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: {
        passwordHash: newHash,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        temporaryPassword: false,
      },
    });

    return { success: true };
  }

  private generateNumericCode(length: number): string {
    const max = 10 ** length;
    return crypto.randomInt(0, max).toString().padStart(length, '0');
  }

  private hashValue(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private async signToken(
    subject: TokenSubject,
    expiresIn?: number,
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: String(subject.id),
      id_role: subject.roleId,
      role: subject.role.name,
      email: subject.email,
      tempPassword: subject.temporaryPassword,
    };

    return this.jwtService.signAsync(payload, {
      expiresIn:
        expiresIn ?? this.configService.get<number>('jwt.expiresIn') ?? 86400,
    });
  }
}
