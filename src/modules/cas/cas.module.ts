import { Module } from '@nestjs/common';
import { CasController } from './cas.controller';
import { CasService } from './cas.service';

@Module({
  controllers: [CasController],
  providers: [CasService],
})
export class CasModule {}
