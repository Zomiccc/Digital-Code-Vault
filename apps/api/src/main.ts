import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled for API; frontends handle their own CSP
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  // Custom security headers
  app.use(new SecurityHeadersMiddleware().use.bind(new SecurityHeadersMiddleware()));

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

  // CORS — allow all origins in development
  const isDev = configService.get<string>('NODE_ENV') === 'development';
  const corsOrigins = configService.get<string>('CORS_ORIGIN', 'http://localhost:5173');
  app.enableCors({
    origin: isDev ? true : corsOrigins.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

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
  logger.log(`API base: http://localhost:${port}/api/v1`);
}

bootstrap();
