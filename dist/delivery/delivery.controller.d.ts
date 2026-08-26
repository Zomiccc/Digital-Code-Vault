import { Response } from 'express';
import { DeliveryService } from './delivery.service';
export declare class DeliveryApiController {
    private deliveryService;
    constructor(deliveryService: DeliveryService);
    getDeliveryInfo(token: string): Promise<{
        fulfillment_id: string;
        product_name: string;
        reference_id: string | null;
        customer_email: string | null;
        customer_name: string | null;
        is_revealed: boolean;
        revealed_at: Date | null;
        status: string;
    }>;
    revealCode(token: string, req: any): Promise<{
        already_revealed: boolean;
        revealed_at: string | Date;
        product_name: string;
        reference_id: string | null;
        customer_email: string | null;
        customer_name: string | null;
        codes: {
            denomination: string;
            code: string;
        }[];
    }>;
}
export declare class DeliveryController {
    private deliveryService;
    constructor(deliveryService: DeliveryService);
    getDeliveryInfo(token: string, res: Response): Promise<void>;
    revealCode(token: string, req: any, res: Response): Promise<void>;
    private errorPage;
}
