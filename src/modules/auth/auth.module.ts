import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RateLimitMiddleware } from '../../common/middleware/rate-limit.middleware';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    PassportModule,
    EmailModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') ?? 'change-me',
        signOptions: {
          expiresIn: configService.get<number>('jwt.expiresIn') ?? 86400,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Syntaxe compatible avec path-to-regexp v8 : le paramètre nommé couvre
    // toutes les routes sous le préfixe global `/api`.
    consumer.apply(RateLimitMiddleware).forRoutes('{*path}');
  }
}
