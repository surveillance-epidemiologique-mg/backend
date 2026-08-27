import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SessionsService } from '../auth/sessions.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
  ) {}

  async journal(filters: { action?: string; userId?: number; limit?: number }) {
    return this.prisma.activiteLog.findMany({
      where: {
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
      },
      include: {
        utilisateur: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
      take: filters.limit ?? 200,
    });
  }

  sessions() {
    return this.sessionsService.listActive();
  }

  async revokeSession(id: number) {
    const session = await this.prisma.sessionToken.findUnique({
      where: { id },
    });
    if (!session) {
      throw new NotFoundException('Session introuvable.');
    }
    await this.sessionsService.revokeById(id);
    return { success: true };
  }

  async tentatives(limit = 100) {
    return this.prisma.loginAttempt.findMany({
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  async roles() {
    return this.prisma.role.findMany({
      orderBy: { id: 'asc' },
      include: {
        permissions: { include: { permission: true } },
      },
    });
  }

  async permissions() {
    return this.prisma.permission.findMany({
      orderBy: { code: 'asc' },
    });
  }

  async updateRolePermissions(roleId: number, codes: string[]) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Rôle introuvable.');
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
    });
    const foundCodes = new Set(permissions.map((p) => p.code));
    const missing = codes.filter((code) => !foundCodes.has(code));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Permissions inconnues : ${missing.join(', ')}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId,
          permissionId: permission.id,
        })),
      }),
    ]);

    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
  }
}
