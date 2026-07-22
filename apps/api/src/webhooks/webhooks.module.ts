import { Module, Global } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhooksController } from './webhooks.controller';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [AuthModule],
  providers: [WebhookService],
  controllers: [WebhooksController],
  exports: [WebhookService],
})
export class WebhooksModule {}
