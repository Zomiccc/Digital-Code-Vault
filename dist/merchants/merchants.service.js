"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const auth_service_1 = require("../auth/auth.service");
const encryption_service_1 = require("../encryption/encryption.service");
const wallet_service_1 = require("../wallet/wallet.service");
const argon2 = __importStar(require("argon2"));
let MerchantsService = class MerchantsService {
    prisma;
    authService;
    encryptionService;
    walletService;
    configService;
    constructor(prisma, authService, encryptionService, walletService, configService) {
        this.prisma = prisma;
        this.authService = authService;
        this.encryptionService = encryptionService;
        this.walletService = walletService;
        this.configService = configService;
    }
    getAdminPaymentDetails() {
        return {
            accounts: [
                {
                    kind: 'RAAST ID',
                    accountTitle: this.configService.get('PAY_RAAST_TITLE', 'DICE GAMES'),
                    accountNumber: this.configService.get('PAY_RAAST_NUMBER', '03247666222'),
                    iban: this.configService.get('PAY_RAAST_IBAN', 'PK03ALFH0303001007274922'),
                },
                {
                    kind: 'Meezan Bank',
                    accountTitle: this.configService.get('PAY_MEEZAN_TITLE', 'DICE GAMES'),
                    accountNumber: this.configService.get('PAY_MEEZAN_NUMBER', '01370104307608'),
                    iban: this.configService.get('PAY_MEEZAN_IBAN', 'PK48MEZN0001370104307608'),
                },
                {
                    kind: 'Faysal Bank',
                    accountTitle: this.configService.get('PAY_FAYSAL_TITLE', 'DICE GAMES'),
                    accountNumber: this.configService.get('PAY_FAYSAL_NUMBER', '0441007000002234'),
                    iban: this.configService.get('PAY_FAYSAL_IBAN', 'PK27FAYS0441007000002234'),
                },
                {
                    kind: 'NayaPay',
                    merchantTitle: this.configService.get('PAY_NAYAPAY_TITLE', 'CodesDukaan'),
                    note: 'Search for "CodesDukaan" or DICE GAMES in the Merchants section of the NayaPay app.',
                },
            ],
            supportContact: {
                name: this.configService.get('SUPPORT_CONTACT_NAME', 'Support Team'),
                number: this.configService.get('SUPPORT_CONTACT_NUMBER', ''),
            },
            instructions: 'Send the exact USD amount to any account above, then upload the payment screenshot here. Admin verifies and approves — your wallet updates automatically.',
        };
    }
    async createMerchant(data) {
        const existing = await this.prisma.merchant.findUnique({ where: { email: data.email } });
        if (existing) {
            throw new common_1.BadRequestException('Merchant with this email already exists');
        }
        const passwordHash = await argon2.hash(data.password);
        const webhookSecret = this.encryptionService.generateToken(32);
        const merchant = await this.prisma.merchant.create({
            data: {
                name: data.name,
                email: data.email,
                address: data.address || null,
                walletBalance: data.initialBalance || 0,
                currency: data.currency || 'USD',
                allowedProductIds: JSON.stringify(data.allowedProductIds || []),
                webhookSecret,
                users: {
                    create: {
                        email: data.email,
                        name: data.name,
                        passwordHash,
                    },
                },
            },
            include: { users: true },
        });
        return {
            id: merchant.id,
            name: merchant.name,
            email: merchant.email,
            address: merchant.address,
            wallet_balance: merchant.walletBalance,
            currency: merchant.currency,
            status: merchant.status,
            created_at: merchant.createdAt,
        };
    }
    async listMerchants() {
        return this.prisma.merchant.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                address: true,
                status: true,
                walletBalance: true,
                currency: true,
                allowedProductIds: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async getMerchant(id) {
        const merchant = await this.prisma.merchant.findUnique({ where: { id } });
        if (!merchant)
            throw new common_1.NotFoundException('Merchant not found');
        return merchant;
    }
    async updateMerchantStatus(id, status) {
        await this.prisma.merchant.update({ where: { id }, data: { status } });
        return { success: true };
    }
    async getWebhookSecret(merchantId) {
        const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant)
            throw new common_1.NotFoundException('Merchant not found');
        if (!merchant.webhookSecret) {
            const secret = this.encryptionService.generateToken(32);
            await this.prisma.merchant.update({ where: { id: merchantId }, data: { webhookSecret: secret } });
            return { webhook_secret: secret };
        }
        return { webhook_secret: merchant.webhookSecret };
    }
    async regenerateWebhookSecret(merchantId) {
        const secret = this.encryptionService.generateToken(32);
        await this.prisma.merchant.update({ where: { id: merchantId }, data: { webhookSecret: secret } });
        return { webhook_secret: secret };
    }
    async addWalletCredit(merchantId, amount, adminId, ip) {
        const adminWalletId = await this.walletService.getOrCreateAdminWallet();
        const result = await this.prisma.$transaction(async (tx) => {
            const updatedAdminWallet = await tx.adminWallet.update({
                where: { id: adminWalletId },
                data: { balance: { decrement: amount } },
            });
            if (Number(updatedAdminWallet.balance) < 0) {
                throw new common_1.BadRequestException({
                    error: 'INSUFFICIENT_ADMIN_WALLET',
                    code: 'INSUFFICIENT_ADMIN_WALLET',
                    message: `Admin wallet has insufficient balance. Required: ${amount}, Available: ${Number(updatedAdminWallet.balance) + amount}`,
                });
            }
            await tx.adminWalletTransaction.create({
                data: {
                    adminWalletId,
                    type: 'DEBIT',
                    amount,
                    balanceAfter: updatedAdminWallet.balance,
                    source: 'MANUAL',
                    description: `Manual credit to merchant ${merchantId} by admin ${adminId}`,
                },
            });
            const updatedMerchant = await tx.merchant.update({
                where: { id: merchantId },
                data: { walletBalance: { increment: amount } },
            });
            await tx.walletTransaction.create({
                data: {
                    merchantId,
                    type: 'CREDIT',
                    amount,
                    balanceAfter: updatedMerchant.walletBalance,
                },
            });
            return { new_balance: updatedMerchant.walletBalance };
        });
        return { success: true, ...result };
    }
    async getWallet(merchantId) {
        const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant)
            throw new common_1.NotFoundException('Merchant not found');
        const recentTxns = await this.prisma.walletTransaction.findMany({
            where: { merchantId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        return {
            balance: merchant.walletBalance,
            currency: merchant.currency,
            name: merchant.name,
            email: merchant.email,
            address: merchant.address,
            recent_transactions: recentTxns.map((t) => ({
                id: t.id,
                type: t.type,
                amount: t.amount,
                reference_id: t.referenceId,
                created_at: t.createdAt,
            })),
        };
    }
    async listApiKeys(merchantId) {
        const keys = await this.prisma.apiKey.findMany({
            where: { merchantId },
            select: {
                id: true,
                keyPrefix: true,
                scopes: true,
                status: true,
                lastUsedAt: true,
                createdAt: true,
                revokedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        const activeKeys = keys.filter((k) => k.status === 'ACTIVE');
        const maxActiveKeys = 3;
        const cooldownHours = 24;
        let nextAvailableKey = null;
        let remainingKeys = maxActiveKeys - activeKeys.length;
        if (remainingKeys <= 0 && activeKeys.length > 0) {
            const lastKey = activeKeys.reduce((latest, k) => new Date(k.createdAt) > new Date(latest.createdAt) ? k : latest);
            const lastKeyTime = new Date(lastKey.createdAt);
            const cooldownEnd = new Date(lastKeyTime.getTime() + cooldownHours * 60 * 60 * 1000);
            if (cooldownEnd > new Date()) {
                nextAvailableKey = cooldownEnd;
                remainingKeys = 0;
            }
            else {
                remainingKeys = 1;
            }
        }
        return {
            keys,
            rate_limit: {
                max_active_keys: maxActiveKeys,
                active_keys: activeKeys.length,
                remaining_keys: remainingKeys,
                next_available_key: nextAvailableKey,
                cooldown_hours: cooldownHours,
            },
        };
    }
    async createApiKey(merchantId, scopes) {
        const activeKeys = await this.prisma.apiKey.findMany({
            where: { merchantId, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
        });
        const maxActiveKeys = 3;
        const cooldownHours = 24;
        if (activeKeys.length >= maxActiveKeys) {
            const lastKey = activeKeys[0];
            const lastKeyTime = new Date(lastKey.createdAt);
            const cooldownEnd = new Date(lastKeyTime.getTime() + cooldownHours * 60 * 60 * 1000);
            if (cooldownEnd > new Date()) {
                const remainingMs = cooldownEnd.getTime() - Date.now();
                const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
                const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
                const remainingSeconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
                throw new common_1.BadRequestException({
                    error: 'RATE_LIMIT_EXCEEDED',
                    code: 'API_KEY_LIMIT_REACHED',
                    message: `You have reached today's API key limit. You can generate another API key after 24 hours.`,
                    details: {
                        active_keys: activeKeys.length,
                        max_active_keys: maxActiveKeys,
                        next_available_key: cooldownEnd.toISOString(),
                        time_remaining: `${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s`,
                    },
                });
            }
        }
        return this.authService.createApiKey(merchantId, scopes || ['fulfillment', 'read']);
    }
    async revokeApiKey(merchantId, keyId) {
        return this.authService.revokeApiKey(merchantId, keyId);
    }
    async listFulfillmentRequests(merchantId, limit = 50, offset = 0) {
        const [reqs, total] = await Promise.all([
            this.prisma.fulfillmentRequest.findMany({
                where: { merchantId },
                include: {
                    product: true,
                    allocations: true,
                    deliveryToken: true,
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            this.prisma.fulfillmentRequest.count({ where: { merchantId } }),
        ]);
        return {
            items: reqs.map((r) => ({
                id: r.id,
                product: r.product.name,
                amount: r.amount,
                status: r.status,
                reference_id: r.referenceId,
                created_at: r.createdAt,
                customer_name: r.customerName,
                customer_email: r.customerEmail,
                customer_address: r.customerAddress,
                revealed: r.deliveryToken?.revealedAt ? true : false,
            })),
            total,
        };
    }
};
exports.MerchantsService = MerchantsService;
exports.MerchantsService = MerchantsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService,
        encryption_service_1.EncryptionService,
        wallet_service_1.WalletService,
        config_1.ConfigService])
], MerchantsService);
//# sourceMappingURL=merchants.service.js.map