import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { SkuService } from './sku.service';
import { ProductsController } from './products.controller';
import { AuthModule } from '../auth/auth.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [AuthModule, CurrencyModule],
  providers: [ProductsService, SkuService],
  controllers: [ProductsController],
  exports: [ProductsService, SkuService],
})
export class ProductsModule {}
