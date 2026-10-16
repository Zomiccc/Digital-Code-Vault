import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { AuthModule } from '../auth/auth.module';
import { CurrencyModule } from '../currency/currency.module';
import { AllocationEngineService } from '../fulfillment/allocation-engine.service';

@Module({
  imports: [AuthModule, CurrencyModule],
  // The allocation engine is stateless; it is provided here directly so the
  // Delivery Rules stock check makes the same decision fulfillment does,
  // without pulling the whole fulfillment module (and its webhooks) in.
  providers: [CatalogService, AllocationEngineService],
  controllers: [CatalogController],
  exports: [CatalogService],
})
export class CatalogModule {}
