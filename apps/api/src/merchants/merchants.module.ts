import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { WalletController, MerchantApiController } from './merchants.controller';
import { MerchantDashboardController } from './merchant-dashboard.controller';
import { AuthModule } from '../auth/auth.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';

@Module({
  imports: [AuthModule, FulfillmentModule],
  providers: [MerchantsService],
  controllers: [WalletController, MerchantApiController, MerchantDashboardController],
  exports: [MerchantsService],
})
export class MerchantsModule {}
