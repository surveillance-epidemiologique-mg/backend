import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  id_role: number;
  role: string;
  email: string;
  tempPassword: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const cookieName =
      configService.get<string>('JWT_COOKIE_NAME') ?? 'access_token';

    super({
      jwtFromRequest: (req: Request): string | null => {
        const cookies = req.cookies as Record<string, unknown> | undefined;
        const fromCookie = cookies?.[cookieName];
        if (typeof fromCookie === 'string' && fromCookie.length > 0) {
          return fromCookie;
        }
        const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
        return fromHeader ?? null;
      },
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'change-me',
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    const userId = Number(payload?.sub);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Jeton invalide.');
    }

    return {
      id: userId,
      id_role: payload.id_role,
      role: payload.role,
      email: payload.email,
      tempPassword: payload.tempPassword,
    };
  }
}
