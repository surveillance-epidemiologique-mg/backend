import { Module } from '@nestjs/common';
import { CasController } from './cas.controller';
import { CasService } from './cas.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [CasController],
  providers: [CasService],
})
export class CasModule {}
