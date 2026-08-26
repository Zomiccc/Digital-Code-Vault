import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
export declare class EssentialsService {
    private prisma;
    private auditService;
    private readonly logger;
    constructor(prisma: PrismaService, auditService: AuditService);
    getDeliveryConfig(productId: string): Promise<{
        productId: string;
        items: {
            id: string;
            denominationId: string;
            faceValue: number;
            currency: string;
            quantity: number;
        }[];
    }>;
    saveDeliveryConfig(productId: string, items: {
        denominationId: string;
        quantity: number;
    }[], actorId?: string): Promise<{
        productId: string;
        items: {
            id: string;
            denominationId: string;
            faceValue: number;
            currency: string;
            quantity: number;
        }[];
    }>;
    getAvailability(productId: string): Promise<{
        productId: string;
        ready: boolean;
        reason: string;
        items: never[];
    } | {
        productId: string;
        ready: boolean;
        items: {
            denominationId: string;
            faceValue: number;
            required: number;
            available: number;
            sufficient: boolean;
        }[];
        reason?: undefined;
    }>;
}
