import { Module } from '@nestjs/common';
import {
  AlertesController,
  ReglesAlerteController,
} from './alertes.controller';
import { AlertesService } from './alertes.service';

@Module({
  controllers: [AlertesController, ReglesAlerteController],
  providers: [AlertesService],
  exports: [AlertesService],
})
export class AlertesModule {}
