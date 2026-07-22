import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    const email = request.body?.email || '';
    const key = `login:${ip}:${email}`;

    // 5 attempts per 60 seconds per IP+email combination
    const result = await this.redisService.rateLimit(key, 5, 60);

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
