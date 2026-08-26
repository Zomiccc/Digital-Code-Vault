import { WebhookService } from './webhook.service';
import { CreateWebhookDto } from '../dto';
export declare class WebhooksController {
    private webhookService;
    constructor(webhookService: WebhookService);
    listEndpoints(req: any): Promise<{
        id: string;
        createdAt: Date;
        url: string;
        status: string;
        updatedAt: Date;
    }[]>;
    registerEndpoint(body: CreateWebhookDto & {
        skipVerification?: boolean;
    }, req: any): Promise<{
        id: string;
        url: string;
        status: string;
        secret: string;
    }>;
    deleteEndpoint(id: string, req: any): Promise<{
        success: boolean;
    }>;
    receiveIncomingWebhook(payload: any, headers: any, req: any): Promise<{
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
    listIncomingWebhooks(req: any): Promise<{
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
    retryIncomingWebhook(id: string, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    listConnectedProducts(req: any): Promise<({
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
    updateConnectedProduct(id: string, body: {
        dcv_product_id?: string;
        dcv_denomination_id?: string | null;
        dcv_variant_id?: string | null;
        inventory_source?: string;
    }, req: any): Promise<{
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
    getWebhookStatistics(req: any): Promise<{
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
}
