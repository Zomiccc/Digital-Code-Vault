import { Module } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [WebhooksModule, EmailModule],
  providers: [DeliveryService],
  controllers: [DeliveryController],
  exports: [DeliveryService],
})
export class DeliveryModule {}
