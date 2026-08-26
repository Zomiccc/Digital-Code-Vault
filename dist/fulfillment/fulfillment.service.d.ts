import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { AllocationEngineService } from './allocation-engine.service';
import { WebhookService } from '../webhooks/webhook.service';
import { EmailService } from '../email/email.service';
import { OrderDigestService } from '../email/order-digest.service';
import { WalletService } from '../wallet/wallet.service';
export declare class FulfillmentService {
    private prisma;
    private configService;
    private encryptionService;
    private auditService;
    private allocationEngine;
    private webhookService;
    private emailService;
    private orderDigestService;
    private walletService;
    private readonly logger;
    constructor(prisma: PrismaService, configService: ConfigService, encryptionService: EncryptionService, auditService: AuditService, allocationEngine: AllocationEngineService, webhookService: WebhookService, emailService: EmailService, orderDigestService: OrderDigestService, walletService: WalletService);
    createFulfillment(params: {
        merchantId: string;
        productId: string;
        amount: number;
        currency: string;
        referenceId?: string;
        idempotencyKey: string;
        sandbox?: boolean;
        customerEmail?: string;
        customerName?: string;
        customerAddress?: string;
        actorId?: string;
        actorType?: 'ADMIN' | 'MERCHANT' | 'SYSTEM';
        ip?: string;
        inventorySource?: string;
        denominationId?: string;
        variantId?: string;
    }): Promise<any>;
    getFulfillmentStatus(fulfillmentId: string, merchantId: string): Promise<{
        fulfillment_id: any;
        status: any;
        reference_id: any;
        created_at: any;
        allocation: string[];
        revealed: boolean;
    }>;
    getDeliveryLink(fulfillmentId: string, merchantId: string): Promise<{
        fulfillment_id: string;
        status: string;
        has_delivery_token: boolean;
        revealed_at: Date | null;
        is_revealed: boolean;
    }>;
    getOrderStatus(referenceId: string, merchantId: string): Promise<{
        fulfillment_id: string;
        reference_id: string | null;
        status: string;
        created_at: Date;
        revealed: boolean;
        revealed_at: Date | null;
    }>;
    reverseFulfillment(fulfillmentId: string, adminId: string, ip?: string): Promise<{
        success: boolean;
        fulfillment_id: string;
        status: string;
    }>;
    private formatFulfillmentResponse;
    fulfillPendingSupplierRequests(productId?: string, denominationId?: string): Promise<{
        id: string;
        success: boolean;
        reason?: string;
    }[]>;
    sweepExpiredReservations(): Promise<{
        count: number;
    }>;
}
