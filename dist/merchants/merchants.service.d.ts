import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { EncryptionService } from '../encryption/encryption.service';
import { WalletService } from '../wallet/wallet.service';
export declare class MerchantsService {
    private prisma;
    private authService;
    private encryptionService;
    private walletService;
    private configService;
    constructor(prisma: PrismaService, authService: AuthService, encryptionService: EncryptionService, walletService: WalletService, configService: ConfigService);
    getAdminPaymentDetails(): {
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
    };
    createMerchant(data: {
        name: string;
        email: string;
        password: string;
        address?: string;
        currency?: string;
        initialBalance?: number;
        allowedProductIds?: string[];
    }): Promise<{
        id: string;
        name: string;
        email: string;
        address: string | null;
        wallet_balance: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        status: string;
        created_at: Date;
    }>;
    listMerchants(): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        status: string;
        email: string;
        address: string | null;
        walletBalance: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        allowedProductIds: string;
    }[]>;
    getMerchant(id: string): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        status: string;
        email: string;
        updatedAt: Date;
        address: string | null;
        walletBalance: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        allowedProductIds: string;
        twoFactorRequired: boolean;
        totalKeysGenerated: number;
        lastKeyGeneratedAt: Date | null;
        webhookSecret: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
        idDocType: string | null;
        idFrontImage: string | null;
        idBackImage: string | null;
        businessNtn: string | null;
    }>;
    updateMerchantStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'): Promise<{
        success: boolean;
    }>;
    getWebhookSecret(merchantId: string): Promise<{
        webhook_secret: string;
    }>;
    regenerateWebhookSecret(merchantId: string): Promise<{
        webhook_secret: string;
    }>;
    addWalletCredit(merchantId: string, amount: number, adminId: string, ip?: string): Promise<{
        new_balance: import("@prisma/client/runtime/library").Decimal;
        success: boolean;
    }>;
    getWallet(merchantId: string): Promise<{
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
    listApiKeys(merchantId: string): Promise<{
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
    createApiKey(merchantId: string, scopes?: string[]): Promise<{
        id: string;
        key: string;
        keyPrefix: string;
        scopes: string[];
        createdAt: Date;
    }>;
    revokeApiKey(merchantId: string, keyId: string): Promise<{
        success: boolean;
    }>;
    listFulfillmentRequests(merchantId: string, limit?: number, offset?: number): Promise<{
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
