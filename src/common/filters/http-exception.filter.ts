import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface PrismaLikeError {
  code?: string;
  message?: string;
  stack?: string;
}

function isPrismaError(exception: unknown): exception is PrismaLikeError {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    typeof (exception as PrismaLikeError).code === 'string' &&
    (exception as PrismaLikeError).code!.startsWith('P')
  );
}

function statusLabel(status: number): string {
  try {
    return HttpStatus[status] ?? 'Error';
  } catch {
    return 'Error';
  }
}

/**
 * Filtre d'exception global :
 * - renvoie les erreurs HTTP telles quelles (format homogène) ;
 * - mappe les erreurs Prisma connues (P2002 → 409, P2025 → 404, P2003 → 409) ;
 * - log les erreurs non gérées et renvoie un 500 générique.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const path = request.originalUrl ?? request.url;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { statusCode: status, message: body, error: statusLabel(status) }
          : { ...(body as object) };
      return void response
        .status(status)
        .json({ ...payload, path } as Record<string, unknown>);
    }

    if (isPrismaError(exception)) {
      const statusMap: Record<string, number> = {
        P2002: HttpStatus.CONFLICT,
        P2003: HttpStatus.CONFLICT,
        P2025: HttpStatus.NOT_FOUND,
      };
      const messageMap: Record<string, string> = {
        P2002: 'Un enregistrement avec cette valeur existe déjà.',
        P2003: 'Violation de contrainte de référence.',
        P2025: 'Enregistrement introuvable.',
      };
      const status = statusMap[exception.code!] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        messageMap[exception.code!] ??
        (exception.message || 'Erreur base de données.');
      if (status >= 500) {
        this.logger.error(
          `Prisma ${exception.code} ${exception.message}`,
          exception.stack,
        );
      }
      return void response
        .status(status)
        .json({
          statusCode: status,
          message,
          error: statusLabel(status),
          path,
        } as Record<string, unknown>);
    }

    this.logger.error(
      'Erreur non gérée',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return void response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erreur interne du serveur.',
      error: statusLabel(HttpStatus.INTERNAL_SERVER_ERROR),
      path,
    } as Record<string, unknown>);
  }
}