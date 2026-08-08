import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './prisma/prisma.module';
import { EncryptionModule } from './encryption/encryption.module';
import { AuditModule } from './audit/audit.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { MerchantsModule } from './merchants/merchants.module';
import { ProductsModule } from './products/products.module';
import { CodesModule } from './codes/codes.module';
import { FulfillmentModule } from './fulfillment/fulfillment.module';
import { DeliveryModule } from './delivery/delivery.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.dev', '../../.env', '../../.env.dev'],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    EncryptionModule,
    AuditModule,
    AuthModule,
    MerchantsModule,
    ProductsModule,
    CodesModule,
    FulfillmentModule,
    DeliveryModule,
    WebhooksModule,
    AdminModule,
    HealthModule,
    EmailModule,
  ],
})
export class AppModule {}
