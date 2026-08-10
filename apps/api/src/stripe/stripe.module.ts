import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { WalletModule } from '../wallet/wallet.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { EmailModule } from '../email/email.module';
import { AuditModule } from '../audit/audit.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    FulfillmentModule,
    EmailModule,
    AuditModule,
    EncryptionModule,
  ],
  providers: [StripeService],
  controllers: [StripeController],
  exports: [StripeService],
})
export class StripeModule {}
