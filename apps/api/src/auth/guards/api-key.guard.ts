import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '@nestjs/config';

export const SCOPES_KEY = 'scopes';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private redisService: RedisService,
    private configService: ConfigService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const apiKey = request.headers['x-api-key'] as string;
    const signature = request.headers['x-signature'] as string;
    const timestamp = request.headers['x-timestamp'] as string;
    const idempotencyKey = request.headers['idempotency-key'] as string;

    if (!apiKey || !signature || !timestamp) {
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        code: 'MISSING_CREDENTIALS',
        message: 'X-Api-Key, X-Signature, and X-Timestamp headers are required',
      });
    }

    // Verify timestamp window
    if (!this.authService.verifyTimestamp(timestamp)) {
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        code: 'TIMESTAMP_EXPIRED',
        message: 'Request timestamp outside allowed window',
      });
    }

    // Verify API key
    const keyInfo = await this.authService.verifyApiKey(apiKey);
    if (!keyInfo) {
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        code: 'INVALID_API_KEY',
        message: 'Invalid or revoked API key',
      });
    }

    // Verify HMAC signature
    // The secret used for HMAC is the API key itself (the full key string)
    const method = request.method;
    const path = request.originalUrl || request.url;
    const body = request.rawBody ? request.rawBody.toString() : '';
    const valid = this.authService.verifyHmacSignature({
      secret: apiKey,
      method,
      path,
      body,
      timestamp,
      signature,
    });

    if (!valid) {
      throw new UnauthorizedException({
        error: 'UNAUTHORIZED',
        code: 'INVALID_SIGNATURE',
        message: 'HMAC signature verification failed',
      });
    }

    // Rate limiting
    const rateLimitPerMinute = this.configService.get<number>('RATE_LIMIT_PER_MINUTE', 120);
    const rateLimitResult = await this.redisService.rateLimit(
      `ratelimit:apikey:${keyInfo.apiKeyId}`,
      rateLimitPerMinute,
      60,
    );

    if (!rateLimitResult.allowed) {
      throw new UnauthorizedException({
        error: 'RATE_LIMITED',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded',
      });
    }

    // Check scopes
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredScopes && requiredScopes.length > 0) {
      const hasScope = requiredScopes.some((scope) => keyInfo.scopes.includes(scope));
      if (!hasScope) {
        throw new UnauthorizedException({
          error: 'FORBIDDEN',
          code: 'INSUFFICIENT_SCOPE',
          message: 'API key lacks required scopes',
        });
      }
    }

    // Attach merchant info to request
    request.apiKeyId = keyInfo.apiKeyId;
    request.merchantId = keyInfo.merchantId;
    request.scopes = keyInfo.scopes;
    request.idempotencyKey = idempotencyKey;

    return true;
  }
}
