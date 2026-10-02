import { Module } from '@nestjs/common';
import { AlertesModule } from '../alertes/alertes.module';
import { CarteService } from './carte.service';
import { CarteController } from './carte.controller';

@Module({
  imports: [AlertesModule],
  controllers: [CarteController],
  providers: [CarteService],
})
export class CarteModule {}
