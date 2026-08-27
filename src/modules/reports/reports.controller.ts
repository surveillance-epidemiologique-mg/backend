import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService, type ReportType } from './reports.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { PERMISSIONS } from '../../common/constants/permissions';
import { ActivityLogService } from '../../core/activity-log/activity-log.service';

const REPORT_TYPES: ReportType[] = [
  'daily',
  'weekly',
  'monthly',
  'disease',
  'region',
  'custom',
];

function parseId(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Permissions(PERMISSIONS.ANALYTICS_READ)
  @Get()
  @ApiOperation({ summary: 'Générer et exporter un rapport (json/csv/pdf)' })
  async generate(
    @CurrentUser('id') userId: number,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('maladieId') maladieId?: string,
    @Query('regionId') regionId?: string,
    @Query('districtId') districtId?: string,
    @Query('format') format?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (!type || !REPORT_TYPES.includes(type as ReportType)) {
      throw new BadRequestException(
        `Type de rapport invalide. Types : ${REPORT_TYPES.join(', ')}`,
      );
    }

    const dataset = await this.reportsService.generate(userId, {
      type: type as ReportType,
      from,
      to,
      maladieId: parseId(maladieId),
      regionId: parseId(regionId),
      districtId: parseId(districtId),
    });

    const fmt = format ?? 'json';

    if (fmt === 'csv') {
      const csv = this.reportsService.toCsv(dataset);
      res?.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res?.setHeader(
        'Content-Disposition',
        `attachment; filename="rapport-${type}.csv"`,
      );
      res?.send(csv);
      return;
    }

    if (fmt === 'pdf') {
      const pdf = await this.reportsService.toPdf(dataset);
      res?.setHeader('Content-Type', 'application/pdf');
      res?.setHeader(
        'Content-Disposition',
        `attachment; filename="rapport-${type}.pdf"`,
      );
      res?.send(pdf);
      return;
    }

    return dataset;
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @UseInterceptors(FileInterceptor('file'))
  @Post('import/csv')
  @ApiOperation({ summary: 'Importer des signalements depuis un CSV (admin)' })
  async importCsv(
    @CurrentUser('id') userId: number,
    @UploadedFile() file?: { buffer: Buffer; originalname?: string },
  ) {
    if (!file) {
      throw new BadRequestException('Fichier CSV requis (champ « file »).');
    }
    const result = await this.reportsService.importCsv(userId, file.buffer);

    await this.activityLog.log({
      userId,
      action: 'report.importCsv',
      resource: 'signalement',
      detail: `Import CSV : ${result.imported} insérés, ${result.skipped} doublons, ${result.errors.length} erreurs.`,
    });

    return result;
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Post('import')
  @ApiOperation({ summary: 'Importer des signalements en JSON (admin)' })
  async importJson(
    @CurrentUser('id') userId: number,
    @Body() body: { rows?: unknown[] },
  ) {
    if (!body || !Array.isArray(body.rows) || body.rows.length === 0) {
      throw new BadRequestException(
        'Le corps doit contenir un tableau « rows » non vide.',
      );
    }
    const rows = body.rows as Array<Record<string, unknown>>;
    const result = await this.reportsService.importRows(userId, rows);

    await this.activityLog.log({
      userId,
      action: 'report.importJson',
      resource: 'signalement',
      detail: `Import JSON : ${result.imported} insérés, ${result.skipped} doublons, ${result.errors.length} erreurs.`,
    });

    return result;
  }
}
