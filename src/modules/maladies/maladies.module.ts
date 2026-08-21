import { Module } from '@nestjs/common';
import { MaladiesController } from './maladies.controller';
import { MaladiesService } from './maladies.service';

@Module({
  controllers: [MaladiesController],
  providers: [MaladiesService],
})
export class MaladiesModule {}
