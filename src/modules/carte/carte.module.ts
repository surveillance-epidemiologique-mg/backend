import { Module } from '@nestjs/common';
import { CarteService } from './carte.service';
import { CarteController } from './carte.controller';

@Module({
  controllers: [CarteController],
  providers: [CarteService],
})
export class CarteModule {}