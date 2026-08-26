import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
export interface DigestItem {
    productName: string;
    fulfillmentId: string;
    referenceId?: string;
    amount: number;
    currency: string;
    codesDelivered: number;
    deliveryLink: string;
}
export declare class OrderDigestService implements OnModuleDestroy {
    private emailService;
    private configService;
    private readonly logger;
    private readonly buckets;
    private readonly windowMs;
    private flushing;
    constructor(emailService: EmailService, configService: ConfigService);
    enqueue(customerEmail: string, item: DigestItem, opts?: {
        customerName?: string;
        merchantName?: string;
    }): void;
    private flush;
    flushAll(): Promise<void>;
    onModuleDestroy(): void;
    private esc;
}
