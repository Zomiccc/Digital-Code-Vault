import { AdminService } from './admin.service';
import { MerchantsService } from '../merchants/merchants.service';
import { ProductsService } from '../products/products.service';
import { CodesService } from '../codes/codes.service';
import { EssentialsService } from '../essentials/essentials.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { DeliveryService } from '../delivery/delivery.service';
import { SupportService } from '../merchants/support.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { CreateMerchantDto, UpdateMerchantStatusDto, CreditWalletDto, CreateProductDto, CreateDenominationDto, CreateSupplierDto, BulkUploadCodesDto, CreateAdminUserDto, FundingRequestActionDto } from '../dto';
export declare class AdminController {
    private adminService;
    private merchantsService;
    private productsService;
    private codesService;
    private essentialsService;
    private authService;
    private prisma;
    private walletService;
    private deliveryService;
    private supportService;
    private fulfillmentService;
    constructor(adminService: AdminService, merchantsService: MerchantsService, productsService: ProductsService, codesService: CodesService, essentialsService: EssentialsService, authService: AuthService, prisma: PrismaService, walletService: WalletService, deliveryService: DeliveryService, supportService: SupportService, fulfillmentService: FulfillmentService);
    getStats(): Promise<{
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
    createMerchant(body: CreateMerchantDto, user: any, req: any): Promise<{
        id: string;
        name: string;
        email: string;
        address: string | null;
        wallet_balance: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        status: string;
        created_at: Date;
    }>;
    updateMerchantStatus(id: string, body: UpdateMerchantStatusDto): Promise<{
        success: boolean;
    }>;
    creditWallet(id: string, body: CreditWalletDto, user: any, req: any): Promise<{
        new_balance: import("@prisma/client/runtime/library").Decimal;
        success: boolean;
    }>;
    getAdminWallet(): Promise<{
        id: string;
        balance: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        total_credits: number | import("@prisma/client/runtime/library").Decimal;
        total_debits: number | import("@prisma/client/runtime/library").Decimal;
        fulfillment_revenue: number | import("@prisma/client/runtime/library").Decimal;
        funding_disbursed: number | import("@prisma/client/runtime/library").Decimal;
        total_merchant_balances: number | import("@prisma/client/runtime/library").Decimal;
        total_platform_funds: any;
        recent_transactions: {
            id: string;
            type: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            balance_after: import("@prisma/client/runtime/library").Decimal;
            reference_id: string | null;
            source: string;
            description: string | null;
            created_at: Date;
        }[];
        funding_requests: {
            id: string;
            merchant: {
                id: string;
                name: string;
                email: string;
            };
            amount: import("@prisma/client/runtime/library").Decimal;
            currency: string;
            note: string | null;
            status: string;
            admin_note: string | null;
            reviewed_by: string | null;
            reviewed_at: Date | null;
            created_at: Date;
        }[];
    }>;
    getAdminWalletTransactions(limit?: string, offset?: string): Promise<{
        items: {
            id: string;
            type: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            balance_after: import("@prisma/client/runtime/library").Decimal;
            reference_id: string | null;
            source: string;
            description: string | null;
            created_at: Date;
        }[];
        total: number;
    }>;
    listFundingRequests(status?: string): Promise<{
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
    approveFundingRequest(id: string, body: FundingRequestActionDto, user: any, req: any): Promise<{
        id: string;
        status: string;
        admin_note: string | null;
        reviewed_at: Date | null;
        merchant_new_balance: import("@prisma/client/runtime/library").Decimal;
        admin_wallet_new_balance: import("@prisma/client/runtime/library").Decimal;
    }>;
    rejectFundingRequest(id: string, body: FundingRequestActionDto, user: any, req: any): Promise<{
        id: string;
        status: string;
        admin_note: string | null;
        reviewed_at: Date | null;
    }>;
    getReconciliationReport(limit?: string, offset?: string): Promise<{
        items: {
            fulfillment_id: string;
            merchant: {
                id: string;
                name: string;
                email: string;
            };
            amount: import("@prisma/client/runtime/library").Decimal;
            status: string;
            reference_id: string | null;
            created_at: Date;
            merchant_debit: number | null;
            admin_credit: number | null;
            matched: boolean;
        }[];
        total: number;
        mismatch_count: number;
        all_matched: boolean;
    }>;
    getMerchantFinance(id: string): Promise<{
        merchant: {
            id: string;
            name: string;
            email: string;
            current_balance: import("@prisma/client/runtime/library").Decimal;
            currency: string;
        };
        total_deposited: number | import("@prisma/client/runtime/library").Decimal;
        total_spent: number | import("@prisma/client/runtime/library").Decimal;
        total_refunds: number | import("@prisma/client/runtime/library").Decimal;
        recent_transactions: {
            id: string;
            type: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            balance_after: import("@prisma/client/runtime/library").Decimal;
            reference_id: string | null;
            fulfillment_id: string | null;
            created_at: Date;
        }[];
        funding_requests: {
            id: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            status: string;
            note: string | null;
            admin_note: string | null;
            created_at: Date;
            reviewed_at: Date | null;
        }[];
    }>;
    listProducts(): Promise<{
        denominations: any[];
        supplier: {
            id: string;
            createdAt: Date;
            name: string;
            status: string;
            updatedAt: Date;
            contactInfo: string | null;
        } | null;
        category: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            description: string | null;
            image: string | null;
            active: boolean;
            slug: string;
            brandId: string | null;
            sortOrder: number;
        } | null;
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
    }[]>;
    createProduct(body: CreateProductDto): Promise<{
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
    }>;
    updateProductType(id: string, body: {
        product_type: string;
    }): Promise<{
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
    }>;
    updateProductCategory(id: string, body: {
        category_id: string | null;
    }): Promise<{
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
    }>;
    createDenomination(id: string, body: CreateDenominationDto): Promise<{
        id: string;
        createdAt: Date;
        currency: string;
        productId: string;
        faceValue: import("@prisma/client/runtime/library").Decimal;
    }>;
    getEssentialsDeliveryConfig(id: string): Promise<{
        productId: string;
        items: {
            id: string;
            denominationId: string;
            faceValue: number;
            currency: string;
            quantity: number;
        }[];
    }>;
    saveEssentialsDeliveryConfig(id: string, body: {
        items: {
            denominationId: string;
            quantity: number;
        }[];
    }, user: any): Promise<{
        productId: string;
        items: {
            id: string;
            denominationId: string;
            faceValue: number;
            currency: string;
            quantity: number;
        }[];
    }>;
    getEssentialsAvailability(id: string): Promise<{
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
    createSupplier(body: CreateSupplierDto): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        status: string;
        updatedAt: Date;
        contactInfo: string | null;
    }>;
    listCodes(denominationId?: string, status?: string, batchId?: string, limit?: string, offset?: string): Promise<{
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
    bulkUploadCodes(body: BulkUploadCodesDto, user: any, req: any): Promise<{
        inserted: number;
        duplicates: number;
        errors: string[];
        batchId: string;
    }>;
    createManualOrder(body: {
        merchantId?: string;
        productId: string;
        amount: number;
        currency?: string;
        variantId?: string;
        customerEmail?: string;
        customerName?: string;
    }, user: any, req: any): Promise<any>;
    getEmergencyStop(): Promise<{
        active: boolean;
        updatedAt: Date | null;
    }>;
    setEmergencyStop(body: {
        enabled: boolean;
    }, user: any): Promise<{
        active: boolean;
    }>;
    revealCode(id: string, user: any, req: any): Promise<{
        id: string;
        code: string;
        masked: string;
        denomination: import("@prisma/client/runtime/library").Decimal;
        product: string;
        status: string;
    }>;
    voidCode(id: string, user: any, req: any): Promise<{
        success: boolean;
    }>;
    getInventoryStats(): Promise<Record<string, number>>;
    listFulfillment(limit?: string, offset?: string): Promise<{
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
    reverseFulfillment(id: string, user: any, req: any): Promise<{
        success: boolean;
        fulfillment_id: string;
        status: string;
    }>;
    regenerateDeliveryLink(id: string, user: any): Promise<{
        fulfillment_id: string;
        delivery_link: string;
        portal_link: string;
    }>;
    listSupportThreads(): Promise<{
        merchantId: string;
        merchantName: string;
        merchantEmail: string;
        merchantStatus: string;
        lastMessage: {
            body: string | null;
            hasImage: boolean;
            senderRole: string;
            createdAt: Date;
        } | null;
        unreadCount: number;
    }[]>;
    getSupportThread(merchantId: string): Promise<{
        merchant: {
            id: string;
            name: string;
            email: string;
            walletBalance: import("@prisma/client/runtime/library").Decimal;
            currency: string;
        };
        messages: {
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
        }[];
    }>;
    replySupportThread(merchantId: string, body: {
        body?: string;
    }, user: any): Promise<{
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
    }>;
    listPendingSupplierRequests(): Promise<{
        items: {
            id: string;
            product: string;
            product_id: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            currency: string;
            reference_id: string | null;
            merchant_id: string;
            created_at: Date;
        }[];
        total: number;
    }>;
    listStaff(): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        email: string;
        role: string;
        isActive: boolean;
        lastLoginAt: Date | null;
    }[]>;
    createStaff(body: CreateAdminUserDto, user: any, req: any): Promise<{
        id: string;
        email: string;
        name: string;
        role: string;
    }>;
    getAuditLogs(limit?: string, offset?: string, entity?: string, action?: string): Promise<{
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
    getApiLogs(limit?: string, offset?: string): Promise<{
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
    listMerchantApplications(status?: string): Promise<({
        customer: {
            id: string;
            name: string;
            email: string;
        };
    } & {
        id: string;
        createdAt: Date;
        status: string;
        updatedAt: Date;
        currency: string;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
        idDocType: string | null;
        idFrontImage: string | null;
        idBackImage: string | null;
        businessNtn: string | null;
        storeName: string;
        storeEmail: string;
        adminNote: string | null;
        reviewedBy: string | null;
        reviewedAt: Date | null;
        customerId: string;
    })[]>;
    approveMerchantApplication(id: string, user: any, req: any): Promise<{
        success: boolean;
        message: string;
        merchantId: string;
        merchantName: string;
    }>;
    rejectMerchantApplication(id: string, body: {
        note?: string;
    }, user: any, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    initializeWallet(body: {
        amount: number;
        description?: string;
    }, user: any, req: any): Promise<{
        success: boolean;
        wallet_id: string;
        new_balance: import("@prisma/client/runtime/library").Decimal;
        transaction_id: string;
    }>;
    createConnectedProductAdmin(body: {
        merchant_id: string;
        platform: string;
        platform_sku: string;
        name: string;
        dcv_product_id?: string;
        dcv_denomination_id?: string;
        dcv_variant_id?: string;
    }): Promise<{
        merchant: {
            id: string;
            name: string;
            email: string;
        };
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
    listConnectedProductsAdmin(merchantId?: string, unmapped?: string): Promise<({
        merchant: {
            id: string;
            name: string;
            email: string;
        };
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
    updateConnectedProductAdmin(id: string, body: {
        dcv_product_id?: string | null;
        dcv_denomination_id?: string | null;
        dcv_variant_id?: string | null;
        sku?: string;
        inventory_source?: string;
    }): Promise<{
        merchant: {
            id: string;
            name: string;
            email: string;
        };
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
    deleteConnectedProductAdmin(id: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
}
