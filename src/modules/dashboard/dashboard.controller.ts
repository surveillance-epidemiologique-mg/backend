import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

function parseId(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Permissions(PERMISSIONS.DASHBOARD_READ)
  @Get('surveillance')
  @ApiOperation({
    summary:
      'Vue nationale de surveillance (KPIs, maladies, régions, zones prioritaires)',
  })
  surveillance(
    @CurrentUser('id') userId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('maladieId') maladieId?: string,
    @Query('regionId') regionId?: string,
    @Query('districtId') districtId?: string,
    @Query('centreId') centreId?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('La date de début doit précéder la fin.');
    }
    return this.dashboardService.surveillance(userId, {
      from: fromDate ? fromDate.toISOString() : undefined,
      to: toDate ? toDate.toISOString() : undefined,
      maladieId: parseId(maladieId),
      regionId: parseId(regionId),
      districtId: parseId(districtId),
      centreId: parseId(centreId),
    });
  }

  @Permissions(PERMISSIONS.DASHBOARD_READ)
  @Get('stats')
  @ApiOperation({
    summary: 'Statistiques du tableau de bord, filtrées par maladie',
  })
  getStats(@Query('diseaseId') diseaseId?: string) {
    let parsed: number | undefined;

    if (diseaseId !== undefined && diseaseId !== '') {
      parsed = Number(diseaseId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new BadRequestException('diseaseId doit être un entier positif.');
      }
    }

    return this.dashboardService.getStats(parsed);
  }
}
