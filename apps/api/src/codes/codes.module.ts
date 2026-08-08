import { Module } from '@nestjs/common';
import { CodesService } from './codes.service';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';

@Module({
  imports: [FulfillmentModule],
  providers: [CodesService],
  exports: [CodesService],
})
export class CodesModule {}
