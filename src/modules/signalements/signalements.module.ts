import { Module } from '@nestjs/common';
import { SignalementsController } from './signalements.controller';
import { SignalementsService } from './signalements.service';

@Module({
  controllers: [SignalementsController],
  providers: [SignalementsService],
})
export class SignalementsModule {}
