import { PrismaService } from '../prisma/prisma.service';
export interface AuditLogInput {
    actorType: string;
    actorId?: string;
    action: string;
    entity: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    ip?: string;
}
export declare class AuditService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    private computeEntryHash;
    log(input: AuditLogInput): Promise<void>;
    verifyChain(limit?: number): Promise<{
        valid: boolean;
        brokenAt?: string;
    }>;
    getLogs(options: {
        actorType?: string;
        actorId?: string;
        entity?: string;
        entityId?: string;
        action?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
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
