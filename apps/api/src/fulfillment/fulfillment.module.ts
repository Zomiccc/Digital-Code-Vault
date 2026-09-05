import { Module, forwardRef } from '@nestjs/common';
import { FulfillmentService } from './fulfillment.service';
import { FulfillmentController, OrdersController, PaymentNotificationController, SandboxController, CatalogSkuController } from './fulfillment.controller';
import { AllocationEngineService } from './allocation-engine.service';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AuthModule } from '../auth/auth.module';
import { CurrencyModule } from '../currency/currency.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [forwardRef(() => WebhooksModule), AuthModule, CurrencyModule, ProductsModule],
  providers: [FulfillmentService, AllocationEngineService, ScheduledTasksService],
  controllers: [FulfillmentController, OrdersController, PaymentNotificationController, SandboxController, CatalogSkuController],
  exports: [FulfillmentService, AllocationEngineService],
})
export class FulfillmentModule {}
