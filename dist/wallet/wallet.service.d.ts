import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
export declare class WalletService {
    private prisma;
    private auditService;
    private readonly logger;
    constructor(prisma: PrismaService, auditService: AuditService);
    getOrCreateAdminWallet(): Promise<string>;
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
    initializeAdminWallet(amount: number, description: string, adminId: string, ip?: string): Promise<{
        success: boolean;
        wallet_id: string;
        new_balance: import("@prisma/client/runtime/library").Decimal;
        transaction_id: string;
    }>;
    getAdminWalletTransactions(limit?: number, offset?: number): Promise<{
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
    createFundingRequest(merchantId: string, amount: number, note?: string, screenshot?: string): Promise<{
        id: string;
        amount: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        note: string | null;
        status: string;
        created_at: Date;
    }>;
    listFundingRequests(merchantId?: string, status?: string): Promise<{
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
    approveFundingRequest(requestId: string, adminId: string, adminNote?: string, ip?: string): Promise<{
        id: string;
        status: string;
        admin_note: string | null;
        reviewed_at: Date | null;
        merchant_new_balance: import("@prisma/client/runtime/library").Decimal;
        admin_wallet_new_balance: import("@prisma/client/runtime/library").Decimal;
    }>;
    rejectFundingRequest(requestId: string, adminId: string, adminNote?: string, ip?: string): Promise<{
        id: string;
        status: string;
        admin_note: string | null;
        reviewed_at: Date | null;
    }>;
    getReconciliationReport(limit?: number, offset?: number): Promise<{
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
    getMerchantFinanceDetail(merchantId: string): Promise<{
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
}
