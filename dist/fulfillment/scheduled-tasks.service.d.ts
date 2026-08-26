import { FulfillmentService } from '../fulfillment/fulfillment.service';
export declare class ScheduledTasksService {
    private fulfillmentService;
    private readonly logger;
    constructor(fulfillmentService: FulfillmentService);
    sweepExpiredReservations(): Promise<void>;
}
