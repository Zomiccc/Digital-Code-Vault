import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FulfillmentService } from '../fulfillment/fulfillment.service';

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(private fulfillmentService: FulfillmentService) {}

  // Run every 5 minutes to sweep expired reservations
  @Cron('*/5 * * * *')
  async sweepExpiredReservations() {
    try {
      await this.fulfillmentService.sweepExpiredReservations();
    } catch (err) {
      this.logger.error(`Failed to sweep expired reservations: ${(err as Error).message}`);
    }
  }
}
