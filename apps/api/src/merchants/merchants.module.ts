import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { WalletController, MerchantApiController } from './merchants.controller';
import { MerchantDashboardController } from './merchant-dashboard.controller';
import { CustomerDashboardController } from './customer-dashboard.controller';
import { PluginDownloadService } from './plugin-download.service';
import { AuthModule } from '../auth/auth.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { ProductsModule } from '../products/products.module';
import { CodesModule } from '../codes/codes.module';

@Module({
  imports: [AuthModule, FulfillmentModule, ProductsModule, CodesModule],
  providers: [MerchantsService, PluginDownloadService],
  controllers: [WalletController, MerchantApiController, MerchantDashboardController, CustomerDashboardController],
  exports: [MerchantsService],
})
export class MerchantsModule {}
