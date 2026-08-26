"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var WalletService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
let WalletService = WalletService_1 = class WalletService {
    prisma;
    auditService;
    logger = new common_1.Logger(WalletService_1.name);
    constructor(prisma, auditService) {
        this.prisma = prisma;
        this.auditService = auditService;
    }
    async getOrCreateAdminWallet() {
        let wallet = await this.prisma.adminWallet.findFirst();
        if (!wallet) {
            wallet = await this.prisma.adminWallet.create({
                data: { balance: 0, currency: 'USD' },
            });
            this.logger.log(`Admin wallet created: ${wallet.id}`);
        }
        return wallet.id;
    }
    async getAdminWallet() {
        const walletId = await this.getOrCreateAdminWallet();
        const wallet = await this.prisma.adminWallet.findUnique({
            where: { id: walletId },
            include: {
                transactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                },
                fundingRequests: {
                    include: { merchant: { select: { id: true, name: true, email: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                },
            },
        });
        if (!wallet) {
            throw new common_1.NotFoundException('Admin wallet not found');
        }
        const totalCredits = await this.prisma.adminWalletTransaction.aggregate({
            where: { adminWalletId: walletId, type: 'CREDIT' },
            _sum: { amount: true },
        });
        const totalDebits = await this.prisma.adminWalletTransaction.aggregate({
            where: { adminWalletId: walletId, type: 'DEBIT' },
            _sum: { amount: true },
        });
        const fulfillmentRevenue = await this.prisma.adminWalletTransaction.aggregate({
            where: { adminWalletId: walletId, type: 'CREDIT', source: 'FULFILLMENT' },
            _sum: { amount: true },
        });
        const fundingDisbursed = await this.prisma.adminWalletTransaction.aggregate({
            where: { adminWalletId: walletId, type: 'DEBIT', source: 'FUNDING' },
            _sum: { amount: true },
        });
        const merchantBalances = await this.prisma.merchant.aggregate({
            _sum: { walletBalance: true },
        });
        return {
            id: wallet.id,
            balance: wallet.balance,
            currency: wallet.currency,
            total_credits: totalCredits._sum.amount || 0,
            total_debits: totalDebits._sum.amount || 0,
            fulfillment_revenue: fulfillmentRevenue._sum.amount || 0,
            funding_disbursed: fundingDisbursed._sum.amount || 0,
            total_merchant_balances: merchantBalances._sum.walletBalance || 0,
            total_platform_funds: wallet.balance + (merchantBalances._sum.walletBalance || 0),
            recent_transactions: wallet.transactions.map((t) => ({
                id: t.id,
                type: t.type,
                amount: t.amount,
                balance_after: t.balanceAfter,
                reference_id: t.referenceId,
                source: t.source,
                description: t.description,
                created_at: t.createdAt,
            })),
            funding_requests: wallet.fundingRequests.map((r) => ({
                id: r.id,
                merchant: r.merchant,
                amount: r.amount,
                currency: r.currency,
                note: r.note,
                status: r.status,
                admin_note: r.adminNote,
                reviewed_by: r.reviewedBy,
                reviewed_at: r.reviewedAt,
                created_at: r.createdAt,
            })),
        };
    }
    async initializeAdminWallet(amount, description, adminId, ip) {
        const walletId = await this.getOrCreateAdminWallet();
        const wallet = await this.prisma.adminWallet.findUnique({ where: { id: walletId } });
        if (!wallet)
            throw new common_1.NotFoundException('Admin wallet not found');
        const newBalance = Number(wallet.balance) + amount;
        const [updatedWallet, txn] = await this.prisma.$transaction([
            this.prisma.adminWallet.update({
                where: { id: walletId },
                data: { balance: newBalance },
            }),
            this.prisma.adminWalletTransaction.create({
                data: {
                    adminWalletId: walletId,
                    type: 'CREDIT',
                    amount,
                    balanceAfter: newBalance,
                    source: 'MANUAL',
                    description: description || `Manual funding by admin ${adminId}`,
                },
            }),
        ]);
        await this.auditService.log({
            actorType: 'ADMIN',
            actorId: adminId,
            action: 'admin.wallet_initialize',
            entity: 'AdminWallet',
            entityId: walletId,
            metadata: { amount, description },
            ip,
        });
        return {
            success: true,
            wallet_id: walletId,
            new_balance: updatedWallet.balance,
            transaction_id: txn.id,
        };
    }
    async getAdminWalletTransactions(limit = 50, offset = 0) {
        const walletId = await this.getOrCreateAdminWallet();
        const [txns, total] = await Promise.all([
            this.prisma.adminWalletTransaction.findMany({
                where: { adminWalletId: walletId },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            this.prisma.adminWalletTransaction.count({ where: { adminWalletId: walletId } }),
        ]);
        return {
            items: txns.map((t) => ({
                id: t.id,
                type: t.type,
                amount: t.amount,
                balance_after: t.balanceAfter,
                reference_id: t.referenceId,
                source: t.source,
                description: t.description,
                created_at: t.createdAt,
            })),
            total,
        };
    }
    async createFundingRequest(merchantId, amount, note, screenshot) {
        if (amount <= 0) {
            throw new common_1.BadRequestException('Amount must be greater than 0');
        }
        if (!screenshot) {
            throw new common_1.BadRequestException('A payment screenshot/proof is required');
        }
        const adminWalletId = await this.getOrCreateAdminWallet();
        const request = await this.prisma.fundingRequest.create({
            data: {
                merchantId,
                adminWalletId,
                amount,
                currency: 'USD',
                note,
                screenshot,
                status: 'PENDING',
            },
        });
        this.logger.log(`Funding request created: ${request.id} for merchant ${merchantId} amount ${amount}`);
        return {
            id: request.id,
            amount: request.amount,
            currency: request.currency,
            note: request.note,
            status: request.status,
            created_at: request.createdAt,
        };
    }
    async listFundingRequests(merchantId, status) {
        const where = {};
        if (merchantId)
            where.merchantId = merchantId;
        if (status)
            where.status = status;
        const requests = await this.prisma.fundingRequest.findMany({
            where,
            include: {
                merchant: { select: { id: true, name: true, email: true, walletBalance: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        return requests.map((r) => ({
            id: r.id,
            merchant: r.merchant,
            amount: r.amount,
            currency: r.currency,
            note: r.note,
            has_screenshot: !!r.screenshot,
            screenshot: r.screenshot,
            status: r.status,
            admin_note: r.adminNote,
            reviewed_by: r.reviewedBy,
            reviewed_at: r.reviewedAt,
            created_at: r.createdAt,
        }));
    }
    async approveFundingRequest(requestId, adminId, adminNote, ip) {
        const request = await this.prisma.fundingRequest.findUnique({
            where: { id: requestId },
            include: { merchant: true },
        });
        if (!request) {
            throw new common_1.NotFoundException('Funding request not found');
        }
        if (request.status !== 'PENDING') {
            throw new common_1.BadRequestException(`Funding request already ${request.status}`);
        }
        const adminWalletId = await this.getOrCreateAdminWallet();
        const adminWallet = await this.prisma.adminWallet.findUnique({ where: { id: adminWalletId } });
        if (!adminWallet) {
            throw new common_1.NotFoundException('Admin wallet not found');
        }
        if (Number(adminWallet.balance) < Number(request.amount)) {
            throw new common_1.BadRequestException({
                error: 'INSUFFICIENT_ADMIN_WALLET',
                code: 'INSUFFICIENT_ADMIN_WALLET',
                message: `Admin wallet has insufficient balance. Required: ${request.amount}, Available: ${adminWallet.balance}`,
            });
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const updatedAdminWallet = await tx.adminWallet.update({
                where: { id: adminWalletId },
                data: { balance: { decrement: request.amount } },
            });
            await tx.adminWalletTransaction.create({
                data: {
                    adminWalletId,
                    type: 'DEBIT',
                    amount: request.amount,
                    balanceAfter: updatedAdminWallet.balance,
                    referenceId: requestId,
                    source: 'FUNDING',
                    description: `Funding approved for ${request.merchant.name}`,
                },
            });
            const updatedMerchant = await tx.merchant.update({
                where: { id: request.merchantId },
                data: { walletBalance: { increment: request.amount } },
            });
            await tx.walletTransaction.create({
                data: {
                    merchantId: request.merchantId,
                    type: 'CREDIT',
                    amount: request.amount,
                    balanceAfter: updatedMerchant.walletBalance,
                    referenceId: requestId,
                },
            });
            const updatedRequest = await tx.fundingRequest.update({
                where: { id: requestId },
                data: {
                    status: 'APPROVED',
                    adminNote,
                    reviewedBy: adminId,
                    reviewedAt: new Date(),
                },
            });
            return { updatedRequest, updatedAdminWallet, updatedMerchant };
        });
        await this.auditService.log({
            actorType: 'ADMIN',
            actorId: adminId,
            action: 'funding.approve',
            entity: 'FundingRequest',
            entityId: requestId,
            metadata: {
                merchantId: request.merchantId,
                amount: request.amount,
                adminWalletBalanceAfter: result.updatedAdminWallet.balance,
                merchantBalanceAfter: result.updatedMerchant.walletBalance,
            },
            ip,
        });
        this.logger.log(`Funding request ${requestId} approved. Merchant ${request.merchantId} credited ${request.amount}`);
        return {
            id: result.updatedRequest.id,
            status: result.updatedRequest.status,
            admin_note: result.updatedRequest.adminNote,
            reviewed_at: result.updatedRequest.reviewedAt,
            merchant_new_balance: result.updatedMerchant.walletBalance,
            admin_wallet_new_balance: result.updatedAdminWallet.balance,
        };
    }
    async rejectFundingRequest(requestId, adminId, adminNote, ip) {
        const request = await this.prisma.fundingRequest.findUnique({ where: { id: requestId } });
        if (!request) {
            throw new common_1.NotFoundException('Funding request not found');
        }
        if (request.status !== 'PENDING') {
            throw new common_1.BadRequestException(`Funding request already ${request.status}`);
        }
        const updated = await this.prisma.fundingRequest.update({
            where: { id: requestId },
            data: {
                status: 'REJECTED',
                adminNote,
                reviewedBy: adminId,
                reviewedAt: new Date(),
            },
        });
        await this.auditService.log({
            actorType: 'ADMIN',
            actorId: adminId,
            action: 'funding.reject',
            entity: 'FundingRequest',
            entityId: requestId,
            metadata: { merchantId: request.merchantId, amount: request.amount },
            ip,
        });
        this.logger.log(`Funding request ${requestId} rejected`);
        return {
            id: updated.id,
            status: updated.status,
            admin_note: updated.adminNote,
            reviewed_at: updated.reviewedAt,
        };
    }
    async getReconciliationReport(limit = 100, offset = 0) {
        const [fulfillments, total] = await Promise.all([
            this.prisma.fulfillmentRequest.findMany({
                where: { walletCharged: true },
                include: {
                    merchant: { select: { id: true, name: true, email: true } },
                    walletTxn: true,
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            this.prisma.fulfillmentRequest.count({ where: { walletCharged: true } }),
        ]);
        const walletId = await this.getOrCreateAdminWallet();
        const items = [];
        let mismatchCount = 0;
        for (const f of fulfillments) {
            const adminTxn = await this.prisma.adminWalletTransaction.findFirst({
                where: { referenceId: f.id, source: 'FULFILLMENT' },
            });
            const merchantDebit = f.walletTxn ? Number(f.walletTxn.amount) : null;
            const adminCredit = adminTxn ? Number(adminTxn.amount) : null;
            const matched = merchantDebit !== null && adminCredit !== null && merchantDebit === adminCredit;
            if (!matched)
                mismatchCount++;
            items.push({
                fulfillment_id: f.id,
                merchant: f.merchant,
                amount: f.amount,
                status: f.status,
                reference_id: f.referenceId,
                created_at: f.createdAt,
                merchant_debit: merchantDebit,
                admin_credit: adminCredit,
                matched,
            });
        }
        return {
            items,
            total,
            mismatch_count: mismatchCount,
            all_matched: mismatchCount === 0,
        };
    }
    async getMerchantFinanceDetail(merchantId) {
        const merchant = await this.prisma.merchant.findUnique({
            where: { id: merchantId },
            include: {
                walletTxns: {
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                },
                fundingRequests: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });
        if (!merchant) {
            throw new common_1.NotFoundException('Merchant not found');
        }
        const totalDebits = await this.prisma.walletTransaction.aggregate({
            where: { merchantId, type: 'DEBIT' },
            _sum: { amount: true },
        });
        const totalCredits = await this.prisma.walletTransaction.aggregate({
            where: { merchantId, type: 'CREDIT' },
            _sum: { amount: true },
        });
        const totalRefunds = await this.prisma.walletTransaction.aggregate({
            where: { merchantId, type: 'REFUND' },
            _sum: { amount: true },
        });
        return {
            merchant: {
                id: merchant.id,
                name: merchant.name,
                email: merchant.email,
                current_balance: merchant.walletBalance,
                currency: merchant.currency,
            },
            total_deposited: totalCredits._sum.amount || 0,
            total_spent: totalDebits._sum.amount || 0,
            total_refunds: totalRefunds._sum.amount || 0,
            recent_transactions: merchant.walletTxns.map((t) => ({
                id: t.id,
                type: t.type,
                amount: t.amount,
                balance_after: t.balanceAfter,
                reference_id: t.referenceId,
                fulfillment_id: t.fulfillmentId,
                created_at: t.createdAt,
            })),
            funding_requests: merchant.fundingRequests.map((r) => ({
                id: r.id,
                amount: r.amount,
                status: r.status,
                note: r.note,
                admin_note: r.adminNote,
                created_at: r.createdAt,
                reviewed_at: r.reviewedAt,
            })),
        };
    }
};
exports.WalletService = WalletService;
exports.WalletService = WalletService = WalletService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], WalletService);
//# sourceMappingURL=wallet.service.js.map