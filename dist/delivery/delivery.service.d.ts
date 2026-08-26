import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { WebhookService } from '../webhooks/webhook.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
export declare class DeliveryService {
    private prisma;
    private encryptionService;
    private auditService;
    private webhookService;
    private emailService;
    private configService;
    private readonly logger;
    constructor(prisma: PrismaService, encryptionService: EncryptionService, auditService: AuditService, webhookService: WebhookService, emailService: EmailService, configService: ConfigService);
    private findDeliveryToken;
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
    revealCode(token: string, ip?: string): Promise<{
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
    regenerateDeliveryLink(fulfillmentId: string, actorId?: string): Promise<{
        fulfillment_id: string;
        delivery_link: string;
        portal_link: string;
    }>;
}
