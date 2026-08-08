import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { MerchantsModule } from '../merchants/merchants.module';
import { ProductsModule } from '../products/products.module';
import { CodesModule } from '../codes/codes.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { AuthModule } from '../auth/auth.module';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [MerchantsModule, ProductsModule, CodesModule, FulfillmentModule, AuthModule, PassportModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
