import { Module, forwardRef } from '@nestjs/common';
import { AdminService } from './admin.service';
import { EmergencyModule } from './emergency.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AdminController } from './admin.controller';
import { MerchantsModule } from '../merchants/merchants.module';
import { ProductsModule } from '../products/products.module';
import { CodesModule } from '../codes/codes.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { AuthModule } from '../auth/auth.module';
import { PassportModule } from '@nestjs/passport';
import { DeliveryModule } from '../delivery/delivery.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [MerchantsModule, ProductsModule, CodesModule, FulfillmentModule, AuthModule, PassportModule, DeliveryModule, CurrencyModule, EmergencyModule, forwardRef(() => WebhooksModule)],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
