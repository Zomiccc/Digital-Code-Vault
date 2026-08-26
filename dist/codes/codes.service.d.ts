import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
export declare class CodesService {
    private prisma;
    private encryptionService;
    private auditService;
    private fulfillmentService;
    private readonly logger;
    constructor(prisma: PrismaService, encryptionService: EncryptionService, auditService: AuditService, fulfillmentService: FulfillmentService);
    bulkUpload(denominationId: string, codes: string[], adminId: string, supplierId?: string, ip?: string, costInfo?: {
        costPerCode?: number;
        currency?: string;
        note?: string;
    }): Promise<{
        inserted: number;
        duplicates: number;
        errors: string[];
        batchId: string;
    }>;
    listCodes(options: {
        denominationId?: string;
        status?: string;
        batchId?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        items: {
            id: string;
            denomination: {
                id: string;
                face_value: import("@prisma/client/runtime/library").Decimal;
                product: string;
                region: string;
            };
            status: string;
            batch_id: string | null;
            reserved_until: Date | null;
            revealed_at: Date | null;
            created_at: Date;
            masked_code: string;
        }[];
        total: number;
    }>;
    revealCode(codeItemId: string, adminId: string, ip?: string): Promise<{
        id: string;
        code: string;
        masked: string;
        denomination: import("@prisma/client/runtime/library").Decimal;
        product: string;
        status: string;
    }>;
    voidCode(codeItemId: string, adminId: string, ip?: string): Promise<{
        success: boolean;
    }>;
    getInventoryStats(): Promise<Record<string, number>>;
    merchantBulkUpload(denominationId: string, codes: string[], merchantId: string, ip?: string): Promise<{
        inserted: number;
        duplicates: number;
        errors: string[];
        batchId: string;
    }>;
    listMerchantCodes(merchantId: string, options: {
        denominationId?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        items: {
            id: string;
            denomination: {
                id: string;
                face_value: import("@prisma/client/runtime/library").Decimal;
                product: string;
                region: string;
            };
            status: string;
            source: string;
            batch_id: string | null;
            reserved_until: Date | null;
            revealed_at: Date | null;
            created_at: Date;
            masked_code: string;
        }[];
        total: number;
    }>;
    getMerchantInventoryStats(merchantId: string): Promise<Record<string, Record<string, number>>>;
    voidMerchantCode(codeItemId: string, merchantId: string, ip?: string): Promise<{
        success: boolean;
    }>;
}
