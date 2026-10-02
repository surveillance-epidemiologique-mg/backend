import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { LAB_CASE_ACCESS_KEY } from '../decorators/lab-case-access.decorator';
import { ROLES } from '../constants/roles';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;

    const laboratoryCaseAccess = this.reflector.getAllAndOverride<boolean>(
      LAB_CASE_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const labCanUseCases =
      laboratoryCaseAccess === true &&
      user?.role === ROLES.LABORATOIRE &&
      this.configService.get<boolean>('laboratoryCanDeclareCases') === true;

    if (!user || (!requiredRoles.includes(user.role) && !labCanUseCases)) {
      throw new ForbiddenException(
        "Vous n'avez pas les droits nécessaires pour accéder à cette ressource.",
      );
    }

    return true;
  }
}
