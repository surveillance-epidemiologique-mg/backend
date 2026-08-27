import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const hasRoles = requiredRoles && requiredRoles.length > 0;
    const hasPermissions =
      requiredPermissions && requiredPermissions.length > 0;

    if (!hasRoles && !hasPermissions) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        "Vous n'avez pas les droits nécessaires pour accéder à cette ressource.",
      );
    }

    if (hasRoles && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        "Vous n'avez pas les droits nécessaires pour accéder à cette ressource.",
      );
    }

    if (hasPermissions) {
      const rolePermissions = await this.prisma.rolePermission.findMany({
        where: { roleId: user.id_role },
        select: { permission: { select: { code: true } } },
      });
      const granted = rolePermissions.map((rp) => rp.permission.code);
      const allowed = requiredPermissions.some((permission) =>
        granted.includes(permission),
      );
      if (!allowed) {
        throw new ForbiddenException(
          "Vous n'avez pas les droits nécessaires pour accéder à cette ressource.",
        );
      }
    }

    return true;
  }
}
