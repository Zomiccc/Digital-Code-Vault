import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    const email = request.body?.email || '';

    // Scope the bucket to the specific endpoint. The unified login flow in the
    // frontend probes admin -> merchant -> customer in sequence, so a shared
    // key would burn three slots for a single user-initiated login attempt.
    const route = request.route?.path || request.url || 'unknown';
    const key = `login:${route}:${ip}:${email}`;

    // 100 attempts per 60 seconds per endpoint+IP+email combination
    const result = await this.redisService.rateLimit(key, 100, 60);

    if (!result.allowed) {
      throw new HttpException(
        {
          error: 'RATE_LIMITED',
          code: 'TOO_MANY_LOGIN_ATTEMPTS',
          message: 'Too many login attempts. Please try again in 60 seconds.',
          retry_after_seconds: Math.ceil((result.resetAt - Date.now()) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
