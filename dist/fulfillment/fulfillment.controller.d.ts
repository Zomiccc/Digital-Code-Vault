import { FulfillmentService } from './fulfillment.service';
import { CreateFulfillmentDto } from '../dto';
export declare class FulfillmentController {
    private fulfillmentService;
    constructor(fulfillmentService: FulfillmentService);
    createFulfillment(body: CreateFulfillmentDto, req: any): Promise<any>;
    getFulfillment(id: string, req: any): Promise<{
        fulfillment_id: any;
        status: any;
        reference_id: any;
        created_at: any;
        allocation: string[];
        revealed: boolean;
    }>;
    getDeliveryLink(id: string, req: any): Promise<{
        fulfillment_id: string;
        status: string;
        has_delivery_token: boolean;
        revealed_at: Date | null;
        is_revealed: boolean;
    }>;
}
export declare class OrdersController {
    private fulfillmentService;
    constructor(fulfillmentService: FulfillmentService);
    getOrderStatus(id: string, req: any): Promise<{
        fulfillment_id: string;
        reference_id: string | null;
        status: string;
        created_at: Date;
        revealed: boolean;
        revealed_at: Date | null;
    }>;
}
export declare class PaymentNotificationController {
    private fulfillmentService;
    constructor(fulfillmentService: FulfillmentService);
    notifyPayment(body: CreateFulfillmentDto, req: any): Promise<any>;
}
export declare class SandboxController {
    private fulfillmentService;
    constructor(fulfillmentService: FulfillmentService);
    sandboxFulfillment(body: CreateFulfillmentDto, req: any): Promise<any>;
}
