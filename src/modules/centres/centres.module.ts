import { Module } from '@nestjs/common';
import { CentresController } from './centres.controller';
import { CentresService } from './centres.service';

@Module({
  controllers: [CentresController],
  providers: [CentresService],
})
export class CentresModule {}
