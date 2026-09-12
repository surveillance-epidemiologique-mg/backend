import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatutDiag } from '../../../generated/prisma/client';
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
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Limites administratives (GeoJSON)' })
  zones() {
    return this.carteService.zonesGeoJson();
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
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Alertes actives (GeoJSON polygones)' })
  alertes() {
    return this.carteService.alertesGeoJson();
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('cas')
  @ApiOperation({
    summary:
      'Cas (GeoJSON points colorés par statut), filtres statut + maladie, Médecin limité à son centre',
  })
  cas(
    @CurrentUser() user: AuthenticatedUser,
    @Query('statut') statut?: StatutDiag,
    @Query('maladieId') maladieId?: string,
  ) {
    return this.carteService.casGeoJson(
      user,
      statut,
      maladieId ? Number(maladieId) : undefined,
    );
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('clusters')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Clusters de cas (GeoJSON points)' })
  clusters() {
    return this.carteService.clustersGeoJson();
  }
}