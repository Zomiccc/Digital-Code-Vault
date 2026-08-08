import { Module, Global, forwardRef } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhooksController } from './webhooks.controller';
import { AuthModule } from '../auth/auth.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';

@Global()
@Module({
  imports: [AuthModule, forwardRef(() => FulfillmentModule)],
  providers: [WebhookService],
  controllers: [WebhooksController],
  exports: [WebhookService],
})
export class WebhooksModule {}
