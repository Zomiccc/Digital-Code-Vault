import { Injectable, NestMiddleware, UnauthorizedException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  async use(req: Request & { idempotencyKey?: string; merchantId?: string }, res: Response, next: NextFunction): Promise<void> {
    // Only enforce on POST/PUT/PATCH
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'] as string;
    const merchantId = req.merchantId;

    if (!idempotencyKey) {
      return next();
    }

    if (!merchantId) {
      return next();
    }

    const redisKey = `idempotency:${merchantId}:${idempotencyKey}`;

    // Try to get cached response
    const cached = await this.redisService.get(redisKey);
    if (cached) {
      const cachedResponse = JSON.parse(cached);
      return res.status(cachedResponse.status).json(cachedResponse.body) as any;
    }

    // Store the original send to intercept response
    const originalSend = res.json.bind(res);
    const ttlMs = this.configService.get<number>('IDEMPOTENCY_KEY_TTL_MS', 86400000);
    const ttlSeconds = Math.floor(ttlMs / 1000);

    res.json = (body: unknown) => {
      // Cache the response for idempotency
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const responseToCache = JSON.stringify({
          status: res.statusCode,
          body,
        });
        this.redisService.set(redisKey, responseToCache, ttlSeconds).catch(() => {
          // Non-critical if Redis fails
        });
      }
      return originalSend(body);
    };

    next();
  }
}
