import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: number,
    expiresInSeconds: number,
    ip?: string | null,
    userAgent?: string | null,
  ): Promise<string> {
    const jti = crypto.randomUUID();

    // Révocation de toutes les sessions antérieures : un seul jeton actif
    // par utilisateur.
    await this.prisma.sessionToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), current: false },
    });

    await this.prisma.sessionToken.create({
      data: {
        jti,
        userId,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
        current: true,
      },
    });

    return jti;
  }

  async revoke(jti: string): Promise<void> {
    await this.prisma.sessionToken.updateMany({
      where: { jti },
      data: { revokedAt: new Date(), current: false },
    });
  }

  async revokeById(id: number): Promise<void> {
    await this.prisma.sessionToken.updateMany({
      where: { id },
      data: { revokedAt: new Date(), current: false },
    });
  }

  async isValid(jti: string): Promise<boolean> {
    const session = await this.prisma.sessionToken.findUnique({
      where: { jti },
    });
    return (
      !!session &&
      session.revokedAt === null &&
      session.expiresAt.getTime() > Date.now()
    );
  }

  listActive() {
    return this.prisma.sessionToken.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      include: {
        utilisateur: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
