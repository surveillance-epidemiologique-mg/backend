import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const method = req.method;
    const url = req.originalUrl;

    res.on('finish', () => {
      const duration = Date.now() - start;
      const user = (req as RequestWithUser).user;
      const who = user ? `user=${user.id} (${user.role})` : 'anonyme';

      this.logger.log(
        `${method} ${url} ${res.statusCode} ${duration}ms - ${who}`,
      );
    });

    next();
  }
}
