import { Response } from 'express';
import { MerchantsService } from './merchants.service';
import { SupportService } from './support.service';
import { PluginDownloadService } from './plugin-download.service';
import { WebhookService } from '../webhooks/webhook.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { WalletService } from '../wallet/wallet.service';
import { CodesService } from '../codes/codes.service';
import { ProductsService } from '../products/products.service';
import { CreateApiKeyDto, CreateWebhookDto, CreateFulfillmentDto, CreateFundingRequestDto, CreateSupportMessageDto } from '../dto';
export declare class MerchantDashboardController {
    private merchantsService;
    private supportService;
    private webhookService;
    private fulfillmentService;
    private codesService;
    private productsService;
    private walletService;
    private pluginDownloadService;
    constructor(merchantsService: MerchantsService, supportService: SupportService, webhookService: WebhookService, fulfillmentService: FulfillmentService, codesService: CodesService, productsService: ProductsService, walletService: WalletService, pluginDownloadService: PluginDownloadService);
    getWallet(req: any): Promise<{
        balance: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        name: string;
        email: string;
        address: string | null;
        recent_transactions: {
            id: string;
            type: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            reference_id: string | null;
            created_at: Date;
        }[];
    }>;
    listMyFundingRequests(req: any): Promise<{
        id: string;
        merchant: {
            id: string;
            name: string;
            email: string;
            walletBalance: import("@prisma/client/runtime/library").Decimal;
        };
        amount: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        note: string | null;
        has_screenshot: boolean;
        screenshot: string | null;
        status: string;
        admin_note: string | null;
        reviewed_by: string | null;
        reviewed_at: Date | null;
        created_at: Date;
    }[]>;
    createFundingRequest(body: CreateFundingRequestDto, req: any): Promise<{
        id: string;
        amount: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        note: string | null;
        status: string;
        created_at: Date;
    }>;
    getPaymentDetails(req: any): Promise<{
        accounts: ({
            kind: string;
            accountTitle: string;
            accountNumber: string;
            iban: string;
            merchantTitle?: undefined;
            note?: undefined;
        } | {
            kind: string;
            merchantTitle: string;
            note: string;
            accountTitle?: undefined;
            accountNumber?: undefined;
            iban?: undefined;
        })[];
        supportContact: {
            name: string;
            number: string;
        };
        instructions: string;
    }>;
    getSupportThread(req: any): Promise<{
        id: string;
        createdAt: Date;
        merchantId: string;
        body: string | null;
        senderRole: string;
        senderName: string | null;
        image: string | null;
        fundingRequestId: string | null;
        readByAdmin: boolean;
        readByMerchant: boolean;
    }[]>;
    sendSupportMessage(body: CreateSupportMessageDto, req: any): Promise<{
        success: boolean;
    }>;
    listOrders(req: any, limit?: string, offset?: string): Promise<{
        items: {
            id: string;
            product: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            status: string;
            reference_id: string | null;
            created_at: Date;
            customer_name: string | null;
            customer_email: string | null;
            customer_address: string | null;
            revealed: boolean;
        }[];
        total: number;
    }>;
    listApiKeys(req: any): Promise<{
        keys: {
            id: string;
            createdAt: Date;
            status: string;
            keyPrefix: string;
            scopes: string;
            lastUsedAt: Date | null;
            revokedAt: Date | null;
        }[];
        rate_limit: {
            max_active_keys: number;
            active_keys: number;
            remaining_keys: number;
            next_available_key: Date | null;
            cooldown_hours: number;
        };
    }>;
    createApiKey(body: CreateApiKeyDto, req: any): Promise<{
        id: string;
        key: string;
        keyPrefix: string;
        scopes: string[];
        createdAt: Date;
    }>;
    createDashboardFulfillment(body: CreateFulfillmentDto, req: any): Promise<any>;
    listWebhooks(req: any): Promise<{
        id: string;
        createdAt: Date;
        url: string;
        status: string;
        updatedAt: Date;
    }[]>;
    createWebhook(body: CreateWebhookDto, req: any): Promise<{
        id: string;
        url: string;
        status: string;
        secret: string;
    }>;
    deleteWebhook(id: string, req: any): Promise<{
        success: boolean;
    }>;
    getWebhookSecret(req: any): Promise<{
        webhook_secret: string;
    }>;
    regenerateWebhookSecret(req: any): Promise<{
        webhook_secret: string;
    }>;
    listInventory(req: any, denominationId?: string, status?: string, limit?: string, offset?: string): Promise<{
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
    getInventoryStats(req: any): Promise<Record<string, Record<string, number>>>;
    uploadCodes(body: {
        denomination_id: string;
        codes: string[];
    }, req: any): Promise<{
        inserted: number;
        duplicates: number;
        errors: string[];
        batchId: string;
    }>;
    voidCode(id: string, req: any): Promise<{
        success: boolean;
    }>;
    listProducts(req: any): Promise<({
        supplier: {
            id: string;
            createdAt: Date;
            name: string;
            status: string;
            updatedAt: Date;
            contactInfo: string | null;
        } | null;
        denominations: {
            id: string;
            createdAt: Date;
            currency: string;
            productId: string;
            faceValue: import("@prisma/client/runtime/library").Decimal;
        }[];
    } & {
        region: string;
        id: string;
        createdAt: Date;
        name: string;
        merchantId: string | null;
        status: string;
        updatedAt: Date;
        productType: string;
        categoryId: string | null;
        supplierId: string | null;
    })[]>;
    downloadWordPressPlugin(res: Response): Promise<void>;
}
