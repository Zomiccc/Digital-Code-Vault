import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env files (same candidates as ConfigModule.forRoot in app.module.ts)
// and validate production config BEFORE NestFactory.create() runs. Nest calls
// every provider's onModuleInit (DB connections, Redis, admin bootstrap, etc.)
// as part of building the application context inside NestFactory.create() —
// so validation must happen before that call, not after it, or a misconfigured
// production environment could already connect/run bootstrap logic with bad
// config before validation gets a chance to fail loudly.
for (const candidate of ['.env', '.env.dev', '../../.env', '../../.env.dev']) {
  const resolved = path.resolve(process.cwd(), candidate);
  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved });
  }
}

import { validateProductionEnv } from './common/production-config.validator';
validateProductionEnv(process.env);

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cors from 'cors';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  // CORS — must be before helmet/security headers so preflight requests are handled
  const isDev = configService.get<string>('NODE_ENV') === 'development';
  const corsOriginsRaw = (configService.get<string>('CORS_ORIGIN', isDev ? '*' : '') || '').replace(/^["']|["']$/g, '');
  const appUrl = (configService.get<string>('APP_URL', '') || '').replace(/\/+$/, '');
  const isWildcard = corsOriginsRaw.trim() === '*';
  const allowedOrigins = corsOriginsRaw.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
  // Also allow APP_URL as a valid origin — delivery/reveal pages are served from there
  if (appUrl && !allowedOrigins.includes(appUrl)) {
    allowedOrigins.push(appUrl);
  }
  app.use(cors({
    origin: (origin, callback) => {
      const normalizedOrigin = (origin || '').replace(/\/+$/, '');
      if (isWildcard || !origin || allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }));

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  // Custom security headers
  const securityHeaders = new SecurityHeadersMiddleware(app.get(ConfigService));
  app.use(securityHeaders.use.bind(securityHeaders));

  // Request logging with redaction
  app.use(new RequestLoggerMiddleware().use.bind(new RequestLoggerMiddleware()));

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global prefix for API routes
  app.setGlobalPrefix('api/v1');

  // Swagger / OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('Digital Code Vault API')
    .setDescription('Secure platform for storing, managing, and fulfilling digital codes (gift cards, activation codes, PINs) with encrypted storage, wallet-based billing, and webhook-driven fulfillment.')
    .setVersion('1.0.0')
    .addTag('auth', 'Authentication endpoints')
    .addTag('fulfillment', 'Merchant fulfillment API (requires API key + HMAC signing)')
    .addTag('orders', 'Order status lookup')
    .addTag('sandbox', 'Sandbox/test fulfillment')
    .addTag('merchant', 'Merchant dashboard endpoints (JWT auth)')
    .addTag('wallet', 'Merchant wallet endpoints (JWT auth)')
    .addTag('products', 'Product catalog endpoints (JWT auth)')
    .addTag('webhooks', 'Webhook management (API key or JWT auth)')
    .addTag('admin', 'Admin dashboard endpoints (JWT auth + admin role)')
    .addTag('delivery', 'Customer delivery portal (token-based, no auth)')
    .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'ApiKeyAuth')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWTAuth')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');
  await app.listen(port);
  logger.log(`Digital Code Vault API running on port ${port}`);
  const loggedBaseUrl = appUrl || `http://localhost:${port}`;
  logger.log(`API base: ${loggedBaseUrl}/api/v1`);
}

bootstrap();
