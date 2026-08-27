import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { PrismaModule } from './core/prisma/prisma.module';
import { ActivityLogModule } from './core/activity-log/activity-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MaladiesModule } from './modules/maladies/maladies.module';
import { CentresModule } from './modules/centres/centres.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SignalementsModule } from './modules/signalements/signalements.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AlertesModule } from './modules/alertes/alertes.module';
import { ZonesModule } from './modules/zones/zones.module';
import { AdminModule } from './modules/admin/admin.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CarteModule } from './modules/carte/carte.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggingMiddleware } from './common/middleware/logging.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    ActivityLogModule,
    AuthModule,
    UsersModule,
    MaladiesModule,
    CentresModule,
    DashboardModule,
    SignalementsModule,
    AnalyticsModule,
    AlertesModule,
    ZonesModule,
    AdminModule,
    ReportsModule,
    CarteModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
