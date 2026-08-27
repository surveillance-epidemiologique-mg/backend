import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CarteService } from './carte.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { TypeCentre } from '../../../generated/prisma/enums';

function parseId(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

@ApiTags('carte')
@ApiBearerAuth()
@Controller('carte')
export class CarteController {
  constructor(private readonly carteService: CarteService) {}

  @Permissions(PERMISSIONS.DASHBOARD_READ)
  @Get('stats')
  @ApiOperation({
    summary:
      'Données cartographiques par région et établissements (niveau épidémiologique calculé côté serveur)',
  })
  getStats(
    @CurrentUser('id') userId: number,
    @Query('maladieId') maladieId?: string,
    @Query('regionId') regionId?: string,
    @Query('districtId') districtId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('typeEtablissement') typeEtablissement?: string,
  ) {
    const type = typeEtablissement
      ? (typeEtablissement as TypeCentre)
      : undefined;

    return this.carteService.getMapData(userId, {
      maladieId: parseId(maladieId),
      regionId: parseId(regionId),
      districtId: parseId(districtId),
      from,
      to,
      typeEtablissement: type && type in TypeCentre ? type : undefined,
    });
  }
}
