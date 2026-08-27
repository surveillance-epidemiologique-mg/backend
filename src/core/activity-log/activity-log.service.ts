import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LogEntry {
  userId?: number | null;
  action: string;
  resource: string;
  resourceId?: number | null;
  detail?: string | null;
  ip?: string | null;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: LogEntry): Promise<void> {
    try {
      await this.prisma.activiteLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId ?? null,
          detail: entry.detail ?? null,
          ip: entry.ip ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        'Impossible d’écrire dans le journal d’activité',
        error,
      );
    }
  }
}
