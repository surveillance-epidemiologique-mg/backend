import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException('Paramètre d’identifiant invalide.');
  }
  return parsed;
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Date invalide.');
  }
  return parsed;
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Permissions(PERMISSIONS.ANALYTICS_READ)
  @Get('options')
  @ApiOperation({
    summary: 'Référentiels d’analyse (maladies, régions, districts)',
  })
  options() {
    return this.analyticsService.options();
  }

  @Permissions(PERMISSIONS.ANALYTICS_READ)
  @Get('summary')
  @ApiOperation({
    summary:
      'Statistiques et agrégations filtrées par maladie, région, district et période',
  })
  summary(
    @CurrentUser('id') userId: number,
    @Query('maladieId') maladieId?: string,
    @Query('regionId') regionId?: string,
    @Query('districtId') districtId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = parseOptionalDate(from);
    const toDate = parseOptionalDate(to);

    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('La date de début doit précéder la fin.');
    }

    return this.analyticsService.summary(userId, {
      maladieId: parseOptionalInt(maladieId),
      regionId: parseOptionalInt(regionId),
      districtId: parseOptionalInt(districtId),
      from: fromDate,
      to: toDate,
    });
  }
}
