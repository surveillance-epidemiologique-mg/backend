import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

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
