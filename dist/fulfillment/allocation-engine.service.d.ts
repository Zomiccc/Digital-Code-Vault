import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
export interface DenominationStock {
    denominationId: string;
    faceValue: number;
    availableCount: number;
}
export interface AllocationResult {
    denominationId: string;
    faceValue: number;
    codeItemIds: string[];
}
export declare class AllocationEngineService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    findBestCombination(denominations: DenominationStock[], targetAmount: number): {
        denominationId: string;
        faceValue: number;
        count: number;
    }[] | null;
    private subsetSumSearch;
    private searchAtDepth;
    confirmAllocation(tx: Prisma.TransactionClient, fulfillmentRequestId: string, allocationResults: AllocationResult[]): Promise<void>;
    releaseReservation(tx: Prisma.TransactionClient, fulfillmentRequestId: string): Promise<void>;
    reverseAllocation(tx: Prisma.TransactionClient, fulfillmentRequestId: string): Promise<void>;
    getAvailableStock(tx: Prisma.TransactionClient | PrismaService, productId: string, merchantId?: string | null): Promise<DenominationStock[]>;
    reserveCodes(tx: Prisma.TransactionClient, fulfillmentRequestId: string, combination: {
        denominationId: string;
        faceValue: number;
        count: number;
    }[], reservationTtlMinutes: number, merchantId?: string | null): Promise<AllocationResult[]>;
}
