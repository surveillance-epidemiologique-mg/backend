import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AlertesService } from './alertes.service';
import { CreateAlerteDto } from './dto/create-alerte.dto';
import { CreateRegleAlerteDto } from './dto/create-regle-alerte.dto';
import { UpdateRegleAlerteDto } from './dto/update-regle-alerte.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { NiveauRisque, StatutAlerte } from '../../../generated/prisma/enums';

@ApiTags('alertes')
@ApiBearerAuth()
@Controller('alertes')
export class AlertesController {
  constructor(private readonly alertesService: AlertesService) {}

  @Permissions(PERMISSIONS.ALERTES_READ)
  @Get('options')
  @ApiOperation({ summary: 'Référentiels du formulaire d’alerte' })
  options() {
    return this.alertesService.options();
  }

  @Permissions(PERMISSIONS.ALERTES_READ)
  @Get('notifications')
  @ApiOperation({ summary: 'Notifications récentes' })
  notifications() {
    return this.alertesService.notifications();
  }

  @Permissions(PERMISSIONS.ALERTES_READ)
  @Get()
  @ApiOperation({ summary: 'Lister les alertes avec indicateur de fraîcheur' })
  list(
    @Query('statut') statut?: string,
    @Query('niveau') niveau?: string,
    @Query('maladieId') maladieId?: string,
    @Query('zoneId') zoneId?: string,
  ) {
    return this.alertesService.list({
      statut: this.parseEnum(statut, StatutAlerte) as StatutAlerte | undefined,
      niveau: this.parseEnum(niveau, NiveauRisque) as NiveauRisque | undefined,
      maladieId: this.parseInt(maladieId),
      zoneId: this.parseInt(zoneId),
    });
  }

  @Permissions(PERMISSIONS.ALERTE_DETECT)
  @Post('detect')
  @ApiOperation({ summary: 'Exécuter la détection automatique' })
  detect() {
    return this.alertesService.detect();
  }

  @Permissions(PERMISSIONS.ALERTE_MANAGE)
  @Post()
  @ApiOperation({ summary: 'Créer manuellement une alerte' })
  create(@CurrentUser('id') userId: number, @Body() dto: CreateAlerteDto) {
    return this.alertesService.create(userId, dto);
  }

  @Permissions(PERMISSIONS.ALERTES_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Consulter une alerte avec son historique' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.alertesService.findOne(id);
  }

  @Permissions(PERMISSIONS.ALERTE_MANAGE)
  @Patch(':id/prise-en-charge')
  @ApiOperation({ summary: 'Prendre en charge une alerte' })
  takeCharge(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.alertesService.takeCharge(userId, id);
  }

  @Permissions(PERMISSIONS.ALERTE_MANAGE)
  @Patch(':id/resolution')
  @ApiOperation({ summary: 'Marquer une alerte comme résolue' })
  resolve(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.alertesService.resolve(userId, id);
  }

  private parseEnum(
    value: string | undefined,
    enumType: object,
  ): string | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }
    return Object.values(enumType).includes(value) ? value : undefined;
  }

  private parseInt(value: string | undefined): number | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
}

@ApiTags('regles-alerte')
@ApiBearerAuth()
@Permissions(PERMISSIONS.REGLE_MANAGE)
@Controller('regles-alerte')
export class ReglesAlerteController {
  constructor(private readonly alertesService: AlertesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les règles de détection (admin)' })
  listRules() {
    return this.alertesService.listRules();
  }

  @Post()
  @ApiOperation({ summary: 'Créer une règle de détection (admin)' })
  createRule(@Body() dto: CreateRegleAlerteDto) {
    return this.alertesService.createRule(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une règle de détection (admin)' })
  updateRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRegleAlerteDto,
  ) {
    return this.alertesService.updateRule(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une règle de détection (admin)' })
  deleteRule(@Param('id', ParseIntPipe) id: number) {
    return this.alertesService.deleteRule(id);
  }
}
