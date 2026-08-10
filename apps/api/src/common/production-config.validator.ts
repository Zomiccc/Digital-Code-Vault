import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Validates that all required environment variables are set when NODE_ENV=production.
 * Called during bootstrap — throws if critical config is missing.
 */
@Injectable()
export class ProductionConfigValidator {
  private readonly logger = new Logger(ProductionConfigValidator.name);

  constructor(private configService: ConfigService) {}

  validate(): void {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv !== 'production') {
      return;
    }

    const errors: string[] = [];

    // JWT secrets — no insecure fallbacks in production
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret || jwtSecret === 'change-me-in-production' || jwtSecret === 'dev-only-insecure-secret') {
      errors.push('JWT_SECRET is missing or uses insecure default. Set a strong random string.');
    }

    const jwtRefreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!jwtRefreshSecret || jwtRefreshSecret === 'change-me-in-production' || jwtRefreshSecret === 'dev-only-insecure-secret') {
      errors.push('JWT_REFRESH_SECRET is missing or uses insecure default. Set a strong random string.');
    }

    // CORS — must be explicitly set in production
    const corsOrigin = this.configService.get<string>('CORS_ORIGIN');
    if (!corsOrigin || corsOrigin.trim() === '*' || corsOrigin.includes('localhost')) {
      errors.push('CORS_ORIGIN must be set to production domain(s) in production. Wildcard and localhost are not allowed.');
    }

    // APP_URL — must be set to production URL (not localhost)
    const appUrl = this.configService.get<string>('APP_URL');
    if (!appUrl || appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
      errors.push('APP_URL must be set to the production API URL (e.g. https://api.yourdomain.com).');
    }

    // REDIS_URL — required for production stability
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      errors.push('REDIS_URL is required in production. In-memory fallback is not safe for production.');
    }

    // ENCRYPTION_KEY — required
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      errors.push('ENCRYPTION_KEY is required. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }

    // DATABASE_URL — must be PostgreSQL in production
    const dbUrl = this.configService.get<string>('DATABASE_URL', '');
    if (!dbUrl) {
      errors.push('DATABASE_URL is required.');
    } else if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
      errors.push('DATABASE_URL must be a PostgreSQL connection string in production.');
    }

    // Email provider — must be configured
    const emailProvider = this.configService.get<string>('EMAIL_PROVIDER');
    if (emailProvider === 'sendgrid') {
      const sgKey = this.configService.get<string>('SENDGRID_API_KEY');
      if (!sgKey) {
        errors.push('SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid.');
      }
    } else if (emailProvider === 'resend') {
      const resendKey = this.configService.get<string>('RESEND_API_KEY');
      if (!resendKey) {
        errors.push('RESEND_API_KEY is required when EMAIL_PROVIDER=resend.');
      }
    } else {
      errors.push('EMAIL_PROVIDER must be set to "sendgrid" or "resend".');
    }

    if (errors.length > 0) {
      this.logger.error('=== PRODUCTION CONFIG VALIDATION FAILED ===');
      for (const err of errors) {
        this.logger.error(`  ✗ ${err}`);
      }
      this.logger.error('=============================================');
      throw new Error(
        `Production config validation failed with ${errors.length} error(s). ` +
        'Fix the above environment variables before starting the application.'
      );
    }

    this.logger.log('Production config validation passed — all required variables are set.');
  }
}
