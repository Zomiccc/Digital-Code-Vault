import { Module, forwardRef } from '@nestjs/common';
import { FulfillmentService } from './fulfillment.service';
import { FulfillmentController, OrdersController, PaymentNotificationController, SandboxController } from './fulfillment.controller';
import { AllocationEngineService } from './allocation-engine.service';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AuthModule } from '../auth/auth.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [forwardRef(() => WebhooksModule), AuthModule, CurrencyModule],
  providers: [FulfillmentService, AllocationEngineService, ScheduledTasksService],
  controllers: [FulfillmentController, OrdersController, PaymentNotificationController, SandboxController],
  exports: [FulfillmentService, AllocationEngineService],
})
export class FulfillmentModule {}
