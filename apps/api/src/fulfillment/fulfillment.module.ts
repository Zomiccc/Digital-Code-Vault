import { Module } from '@nestjs/common';
import { FulfillmentService } from './fulfillment.service';
import { FulfillmentController, OrdersController, SandboxController } from './fulfillment.controller';
import { AllocationEngineService } from './allocation-engine.service';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [WebhooksModule, AuthModule],
  providers: [FulfillmentService, AllocationEngineService, ScheduledTasksService],
  controllers: [FulfillmentController, OrdersController, SandboxController],
  exports: [FulfillmentService, AllocationEngineService],
})
export class FulfillmentModule {}
