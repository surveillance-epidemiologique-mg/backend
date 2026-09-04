import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AlertesService } from './alertes.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';

@ApiTags('alertes')
@ApiBearerAuth()
@Controller('alertes')
export class AlertesController {
  constructor(private readonly alertesService: AlertesService) {}

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get()
  @ApiOperation({ summary: 'Lister les alertes actives' })
  list() {
    return this.alertesService.listActive();
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Post('run')
  @ApiOperation({ summary: 'Déclencher manuellement le moteur de détection' })
  run() {
    return this.alertesService.runDetection();
  }
}