import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

interface Attempt {
  count: number;
  resetAt: number;
}

const LIMIT = 10;
const WINDOW_MS = 60_000;
const MAX_ENTRIES = 1_000;

/**
 * Limite le nombre de tentatives par adresse IP + route (ex: login,
 * mot de passe oublié) pour prévenir le brute-force.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly attempts = new Map<string, Attempt>();

  use(req: Request, res: Response, next: NextFunction) {
    const path = req.originalUrl.split('?')[0];
    const isProtected =
      req.method === 'POST' &&
      (path === '/api/auth/login' ||
        path === '/api/auth/forgot-password' ||
        path === '/api/auth/verify-reset-code' ||
        path === '/api/auth/reset-password');
    if (!isProtected) {
      return next();
    }

    if (this.attempts.size > MAX_ENTRIES) {
      const now = Date.now();
      for (const [key, value] of this.attempts) {
        if (value.resetAt < now) {
          this.attempts.delete(key);
        }
      }
    }

    const key = `${req.ip ?? 'unknown'}:${req.method}:${path}`;
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry || entry.resetAt < now) {
      this.attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }

    entry.count += 1;
    if (entry.count > LIMIT) {
      return res.status(429).json({
        statusCode: 429,
        message: 'Trop de tentatives. Réessayez dans une minute.',
      });
    }
    return next();
  }
}