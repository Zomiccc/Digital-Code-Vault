import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// Fields that should never appear in logs
const REDACTED_FIELDS = [
  'password', 'passwordHash', 'secret', 'apiKey', 'api_key', 'token',
  'encryptedCode', 'code', 'authorization', 'cookie', 'x-signature',
  'x-api-key', 'keyHash', 'twoFactorSecret', 'webhookSecret',
];

function redact(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_FIELDS.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redact(value);
    }
  }
  return result;
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;

      // Never log request body (may contain codes or secrets)
      this.logger.log(
        `${method} ${originalUrl} ${statusCode} ${duration}ms - ${ip}`
      );
    });

    next();
  }
}
