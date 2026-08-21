import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TEMP_PASSWORD_ALLOWED_KEY } from '../decorators/temp-password-allowed.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Authentification requise.');
    }

    const tempPasswordAllowed = this.reflector.getAllAndOverride<boolean>(
      TEMP_PASSWORD_ALLOWED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      (user as unknown as AuthenticatedUser).tempPassword &&
      !tempPasswordAllowed
    ) {
      throw new ForbiddenException(
        'Veuillez définir votre mot de passe avant de continuer.',
      );
    }

    return user;
  }
}
