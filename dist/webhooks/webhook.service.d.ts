import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
export declare class WebhookService implements OnModuleDestroy {
    private prisma;
    private encryptionService;
    private configService;
    private fulfillmentService;
    private readonly logger;
    private queue;
    private worker;
    private readonly maxRetries;
    private readonly redisUrl;
    private processingQueue;
    private readonly isProduction;
    constructor(prisma: PrismaService, encryptionService: EncryptionService, configService: ConfigService, fulfillmentService: FulfillmentService);
    private initBullMQ;
    private processingInterval?;
    private readonly memQueue;
    private initFallbackQueue;
    private processFallbackQueue;
    private deliverWebhook;
    queueWebhookEvent(merchantId: string, event: string, data: Record<string, unknown>): Promise<void>;
    registerEndpoint(merchantId: string, url: string, skipVerification?: boolean): Promise<{
        id: string;
        url: string;
        status: string;
        secret: string;
    }>;
    private verifyWebhookChallenge;
    private classifyVerificationNetworkError;
    listEndpoints(merchantId: string): Promise<{
        id: string;
        createdAt: Date;
        url: string;
        status: string;
        updatedAt: Date;
    }[]>;
    deleteEndpoint(merchantId: string, endpointId: string): Promise<{
        success: boolean;
    }>;
    processIncomingWebhook(payload: any, headers: any, sourceIp?: string): Promise<{
        success: boolean;
        message: string;
        eventId: string;
        webhookId?: undefined;
    } | {
        success: boolean;
        message: string;
        webhookId: string;
        eventId: string;
    }>;
    private parseWebhookPayload;
    private syncConnectedProduct;
    private processWebhookAsync;
    listIncomingWebhooks(merchantId?: string): Promise<{
        id: string;
        createdAt: Date;
        merchantId: string | null;
        errorMessage: string | null;
        retryCount: number;
        updatedAt: Date;
        currency: string | null;
        signature: string | null;
        customerName: string | null;
        amount: import("@prisma/client/runtime/library").Decimal | null;
        productId: string | null;
        customerEmail: string | null;
        quantity: number | null;
        eventId: string;
        platform: string;
        provider: string | null;
        orderId: string | null;
        productName: string | null;
        productSku: string | null;
        productCategory: string | null;
        paymentStatus: string | null;
        orderStatus: string | null;
        processingStatus: string;
        rawPayload: string;
        rawHeaders: string | null;
        sourceIp: string | null;
        responseCode: number | null;
        processedAt: Date | null;
    }[]>;
    retryIncomingWebhook(webhookId: string, merchantId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    listConnectedProducts(merchantId: string): Promise<({
        dcvProduct: {
            region: string;
            id: string;
            name: string;
        } | null;
    } & {
        category: string | null;
        id: string;
        createdAt: Date;
        name: string;
        merchantId: string;
        status: string;
        updatedAt: Date;
        currency: string | null;
        inventorySource: string | null;
        platform: string;
        provider: string | null;
        platformSku: string | null;
        platformProductId: string | null;
        sku: string | null;
        imageUrl: string | null;
        price: import("@prisma/client/runtime/library").Decimal | null;
        stock: number;
        dcvProductId: string | null;
        dcvDenominationId: string | null;
        dcvVariantId: string | null;
        lastSyncedAt: Date | null;
    })[]>;
    updateConnectedProductMapping(connectedProductId: string, merchantId: string, dcvProductId?: string, dcvDenominationId?: string | null, inventorySource?: string, dcvVariantId?: string | null): Promise<{
        dcvProduct: {
            region: string;
            id: string;
            name: string;
        } | null;
    } & {
        category: string | null;
        id: string;
        createdAt: Date;
        name: string;
        merchantId: string;
        status: string;
        updatedAt: Date;
        currency: string | null;
        inventorySource: string | null;
        platform: string;
        provider: string | null;
        platformSku: string | null;
        platformProductId: string | null;
        sku: string | null;
        imageUrl: string | null;
        price: import("@prisma/client/runtime/library").Decimal | null;
        stock: number;
        dcvProductId: string | null;
        dcvDenominationId: string | null;
        dcvVariantId: string | null;
        lastSyncedAt: Date | null;
    }>;
    getWebhookStatistics(merchantId: string): Promise<{
        totalWebhooks: number;
        completedWebhooks: number;
        failedWebhooks: number;
        pendingWebhooks: number;
        skippedWebhooks: number;
        connectedProducts: number;
        lastWebhookTime: Date | null;
        emailsSent: number;
        emailsFailed: number;
        platforms: {
            platform: string;
            count: number;
        }[];
    }>;
    onModuleDestroy(): Promise<void>;
}
