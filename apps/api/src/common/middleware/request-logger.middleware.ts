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

/** A request that only fetched a file the browser already knows how to cache. */
function isStaticAsset(path: string): boolean {
  return /\.(js|mjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|txt|json)$/i.test(path);
}

/** Polled constantly by an open admin tab; nothing is learned from logging them. */
const CHATTY_PATHS = [
  '/api/v1/health',
  '/api/v1/merchant/dashboard/support/messages',
  '/api/v1/merchant/dashboard/platform-status',
  '/api/v1/admin/support/threads',
];

/** Anything slower than this is worth a line even when it succeeded. */
const SLOW_MS = 2000;

/**
 * One line per request that tells you something.
 *
 * This logged every request without exception, including every JavaScript
 * file, stylesheet and icon — the frontend is served by this same process, so
 * one page load wrote a dozen lines. Add screens that poll every few seconds
 * and the log grew all day whether or not anyone was using the platform, with
 * nothing rotating it. The host eventually ran out of disk and answered every
 * request with a 503.
 *
 * So: failures always, slow requests always, and everything else only outside
 * production. A static asset that returned fine is never worth a line.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  private readonly verbose = process.env.NODE_ENV !== 'production';

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;

      const failed = statusCode >= 400;
      const slow = duration >= SLOW_MS;
      const noisy = isStaticAsset(req.path) || CHATTY_PATHS.includes(req.path);

      // A failure is always worth knowing about, even on a polled path.
      if (!failed && !slow && (noisy || !this.verbose)) return;

      // Bots probe for /wp-admin, /xmlrpc.php, /.env and the like around the
      // clock. A 4xx outside the API is one of those, not a user hitting a bug.
      if (!this.verbose && statusCode < 500 && !slow && !req.path.startsWith('/api/')) return;

      // Never log request body (may contain codes or secrets)
      const line = `${method} ${originalUrl} ${statusCode} ${duration}ms - ${ip}`;
      if (statusCode >= 500) this.logger.error(line);
      else if (failed || slow) this.logger.warn(line);
      else this.logger.log(line);
    });

    next();
  }
}
