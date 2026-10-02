import { Module } from '@nestjs/common';
import { AlertesModule } from '../alertes/alertes.module';
import { MaladiesController } from './maladies.controller';
import { MaladiesService } from './maladies.service';

@Module({
  imports: [AlertesModule],
  controllers: [MaladiesController],
  providers: [MaladiesService],
})
export class MaladiesModule {}
