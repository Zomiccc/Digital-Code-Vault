import { MerchantsService } from './merchants.service';
export declare class WalletController {
    private merchantsService;
    constructor(merchantsService: MerchantsService);
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
}
export declare class MerchantApiController {
    private merchantsService;
    constructor(merchantsService: MerchantsService);
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
    createApiKey(body: {
        scopes?: string[];
    }, req: any): Promise<{
        id: string;
        key: string;
        keyPrefix: string;
        scopes: string[];
        createdAt: Date;
    }>;
    revokeApiKey(id: string, req: any): Promise<{
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
}
