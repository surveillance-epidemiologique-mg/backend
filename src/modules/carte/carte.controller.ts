import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CarteQueryDto } from './dto/carte-query.dto';
import { CarteService } from './carte.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('carte')
@ApiBearerAuth()
@Controller('carte')
export class CarteController {
  constructor(private readonly carteService: CarteService) {}

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('zones')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Limites administratives (GeoJSON)' })
  zones(@Query() query: CarteQueryDto) {
    return this.carteService.zonesGeoJson(
      query.id_maladie ?? query.maladieId,
      query.refresh,
    );
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('regions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Régions ADM1 (GeoJSON + niveau de risque)' })
  regions(@Query() query: CarteQueryDto) {
    return this.carteService.regionsGeoJson(
      query.id_maladie ?? query.maladieId,
      query.refresh,
    );
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('centres')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Centres de santé (GeoJSON points)' })
  centres() {
    return this.carteService.centresGeoJson();
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('alertes')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Alertes actives (GeoJSON polygones)' })
  alertes(@Query() query: CarteQueryDto) {
    return this.carteService.alertesGeoJson(query.refresh);
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('cas')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Cas (GeoJSON points colorés par statut), filtres statut + maladie, Médecin limité à son centre',
  })
  cas(@CurrentUser() user: AuthenticatedUser, @Query() query: CarteQueryDto) {
    return this.carteService.casGeoJson(
      user,
      query.statut,
      query.id_maladie ?? query.maladieId,
    );
  }
  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('alertes-regions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Alertes par région (ADM1) : [{ region_name, risk_level }]',
  })
  alertesRegions(@Query() query: CarteQueryDto) {
    return this.carteService.alertesRegions(
      query.id_maladie ?? query.maladieId,
    );
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('zone/:id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Résumé contextuel d’une zone (centres, alertes, comptage des cas)',
  })
  zoneSummary(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CarteQueryDto,
  ) {
    return this.carteService.zoneSummary(
      id,
      user,
      query.id_maladie ?? query.maladieId,
    );
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('clusters')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Clusters de cas (GeoJSON points)' })
  clusters(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CarteQueryDto,
  ) {
    return this.carteService.clustersGeoJson(
      user,
      query.id_maladie ?? query.maladieId,
      query.refresh,
    );
  }
}
