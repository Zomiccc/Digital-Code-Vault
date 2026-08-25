import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Validates that all required environment variables are set when NODE_ENV=production.
 *
 * IMPORTANT: this reads directly from `process.env` (via the `env` param) rather
 * than Nest's ConfigService, so it can be called BEFORE `NestFactory.create()`.
 * Nest triggers every provider's `onModuleInit` (DB connections, Redis, the admin
 * bootstrap service, etc.) as part of building the application context — which
 * happens during `NestFactory.create()`, before any code that runs after it. If
 * validation only ran after `NestFactory.create()`, a misconfigured production
 * environment would already have connected to databases / run bootstrap logic
 * with bad config before the validator ever got a chance to fail loudly.
 */
export function validateProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
  const logger = new Logger('ProductionConfigValidator');

  const nodeEnv = env.NODE_ENV || 'development';
  if (nodeEnv !== 'production') {
    return;
  }

  const errors: string[] = [];

  // JWT secrets — no insecure fallbacks in production
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === 'change-me-in-production' || jwtSecret === 'dev-only-insecure-secret') {
    errors.push('JWT_SECRET is missing or uses insecure default. Set a strong random string.');
  }

  const jwtRefreshSecret = env.JWT_REFRESH_SECRET;
  if (!jwtRefreshSecret || jwtRefreshSecret === 'change-me-in-production' || jwtRefreshSecret === 'dev-only-insecure-secret') {
    errors.push('JWT_REFRESH_SECRET is missing or uses insecure default. Set a strong random string.');
  }

  // CORS — must be explicitly set in production
  const corsOrigin = env.CORS_ORIGIN;
  if (!corsOrigin || corsOrigin.trim() === '*' || corsOrigin.includes('localhost')) {
    errors.push('CORS_ORIGIN must be set to production domain(s) in production. Wildcard and localhost are not allowed.');
  }

  // APP_URL — must be set to production URL (not localhost)
  const appUrl = env.APP_URL;
  if (!appUrl || appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
    errors.push('APP_URL must be set to the production API URL (e.g. https://api.yourdomain.com).');
  }

  // REDIS_URL — required for production stability
  const redisUrl = env.REDIS_URL;
  if (!redisUrl) {
    errors.push('REDIS_URL is required in production. In-memory fallback is not safe for production.');
  }

  // ENCRYPTION_KEY — required
  const encryptionKey = env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    errors.push('ENCRYPTION_KEY is required. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }

  // DATABASE_URL — must be PostgreSQL in production
  const dbUrl = env.DATABASE_URL || '';
  if (!dbUrl) {
    errors.push('DATABASE_URL is required.');
  } else if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    errors.push('DATABASE_URL must be a PostgreSQL connection string in production.');
  }

  // Email provider — must be configured
  const emailProvider = env.EMAIL_PROVIDER;
  if (emailProvider === 'sendgrid') {
    if (!env.SENDGRID_API_KEY) {
      errors.push('SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid.');
    }
  } else if (emailProvider === 'resend') {
    if (!env.RESEND_API_KEY) {
      errors.push('RESEND_API_KEY is required when EMAIL_PROVIDER=resend.');
    }
  } else if (emailProvider === 'smtp') {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
      errors.push('SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are all required when EMAIL_PROVIDER=smtp.');
    }
  } else {
    errors.push('EMAIL_PROVIDER must be set to "sendgrid", "resend", or "smtp".');
  }

  if (errors.length > 0) {
    const message = '=== PRODUCTION CONFIG VALIDATION FAILED ===\n' +
      errors.map(e => `  ✗ ${e}`).join('\n') +
      '\n=============================================';
    logger.error(message);
    throw new Error(message);
  }

  logger.log('Production config validation passed — all required variables are set.');
}

/**
 * @deprecated Kept for backwards compatibility with any code that constructs
 * this via Nest DI. Prefer calling `validateProductionEnv()` directly, before
 * `NestFactory.create()`, as done in `main.ts`.
 */
@Injectable()
export class ProductionConfigValidator {
  constructor(private configService: ConfigService) {}

  validate(): void {
    validateProductionEnv(process.env);
  }
}
