import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../encryption/encryption.service';
import { MerchantsService } from '../merchants/merchants.service';
import { ProductsService } from '../products/products.service';
import { CodesService } from '../codes/codes.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
export declare class AdminService {
    private prisma;
    private configService;
    private auditService;
    private encryptionService;
    private merchantsService;
    private productsService;
    private codesService;
    private fulfillmentService;
    private readonly logger;
    constructor(prisma: PrismaService, configService: ConfigService, auditService: AuditService, encryptionService: EncryptionService, merchantsService: MerchantsService, productsService: ProductsService, codesService: CodesService, fulfillmentService: FulfillmentService);
    getDashboardStats(): Promise<{
        merchants: {
            total: number;
            active: number;
        };
        products: number;
        codes: {
            total: number;
        };
        fulfillment: {
            pending: number;
            allocated: number;
            delivered: number;
        };
    }>;
    createAdminUser(data: {
        email: string;
        name: string;
        password: string;
        role: string;
    }, creatorId: string, ip?: string): Promise<{
        id: string;
        email: string;
        name: string;
        role: string;
    }>;
    listAdminUsers(): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        email: string;
        role: string;
        isActive: boolean;
        lastLoginAt: Date | null;
    }[]>;
    createSupplier(data: {
        name: string;
        contactInfo?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        status: string;
        updatedAt: Date;
        contactInfo: string | null;
    }>;
    listSuppliers(): Promise<({
        _count: {
            products: number;
            codeItems: number;
        };
    } & {
        id: string;
        createdAt: Date;
        name: string;
        status: string;
        updatedAt: Date;
        contactInfo: string | null;
    })[]>;
    listAllFulfillmentRequests(limit?: number, offset?: number): Promise<{
        items: {
            id: string;
            merchant: {
                id: string;
                name: string;
                email: string;
                address: string | null;
            };
            product: {
                region: string;
                id: string;
                name: string;
            };
            amount: import("@prisma/client/runtime/library").Decimal;
            currency: string;
            status: string;
            reference_id: string | null;
            customer_name: string | null;
            customer_email: string | null;
            customer_address: string | null;
            merchant_address: string | null;
            created_at: Date;
            failure_reason: string | null;
            revealed: boolean;
        }[];
        total: number;
    }>;
    reverseFulfillment(fulfillmentId: string, adminId: string, ip?: string): Promise<{
        success: boolean;
        fulfillment_id: string;
        status: string;
    }>;
    getAuditLogs(limit?: number, offset?: number, entity?: string, action?: string): Promise<{
        logs: {
            id: string;
            actorType: string;
            actorId: string | null;
            action: string;
            entity: string;
            entityId: string | null;
            metadata: string | null;
            ip: string | null;
            prevHash: string | null;
            entryHash: string | null;
            createdAt: Date;
        }[];
        total: number;
    }>;
    getApiLogs(limit?: number, offset?: number): Promise<{
        logs: {
            id: string;
            actorType: string;
            actorId: string | null;
            action: string;
            entity: string;
            entityId: string | null;
            metadata: string | null;
            ip: string | null;
            prevHash: string | null;
            entryHash: string | null;
            createdAt: Date;
        }[];
        total: number;
    }>;
}
