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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var FulfillmentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FulfillmentService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const encryption_service_1 = require("../encryption/encryption.service");
const audit_service_1 = require("../audit/audit.service");
const allocation_engine_service_1 = require("./allocation-engine.service");
const webhook_service_1 = require("../webhooks/webhook.service");
const email_service_1 = require("../email/email.service");
const order_digest_service_1 = require("../email/order-digest.service");
const wallet_service_1 = require("../wallet/wallet.service");
let FulfillmentService = FulfillmentService_1 = class FulfillmentService {
    prisma;
    configService;
    encryptionService;
    auditService;
    allocationEngine;
    webhookService;
    emailService;
    orderDigestService;
    walletService;
    logger = new common_1.Logger(FulfillmentService_1.name);
    constructor(prisma, configService, encryptionService, auditService, allocationEngine, webhookService, emailService, orderDigestService, walletService) {
        this.prisma = prisma;
        this.configService = configService;
        this.encryptionService = encryptionService;
        this.auditService = auditService;
        this.allocationEngine = allocationEngine;
        this.webhookService = webhookService;
        this.emailService = emailService;
        this.orderDigestService = orderDigestService;
        this.walletService = walletService;
    }
    async createFulfillment(params) {
        const { merchantId, productId, amount, currency, referenceId, idempotencyKey, sandbox, customerEmail, customerName, customerAddress, actorId, actorType, ip } = params;
        if (actorType !== 'ADMIN') {
            const stop = await this.prisma.platformSetting.findUnique({ where: { key: 'EMERGENCY_STOP' } });
            if (stop?.value === 'true') {
                throw new common_1.BadRequestException({
                    error: 'SERVICE_PAUSED',
                    code: 'EMERGENCY_STOP',
                    message: 'Code delivery is temporarily paused by the platform. Please try again later.',
                });
            }
        }
        const requestedSource = params.inventorySource || 'DCV';
        const exactDenominationId = params.denominationId || null;
        const variantId = params.variantId || null;
        if (amount <= 0) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'INVALID_AMOUNT',
                message: 'Amount must be greater than 0',
            });
        }
        const existing = await this.prisma.fulfillmentRequest.findUnique({
            where: {
                merchantId_idempotencyKey: { merchantId, idempotencyKey },
            },
            include: {
                allocations: true,
                deliveryToken: true,
            },
        });
        if (existing) {
            const response = this.formatFulfillmentResponse(existing);
            const idempotencyRecord = await this.prisma.idempotencyRecord.findUnique({
                where: { key: `${merchantId}:${idempotencyKey}` },
            });
            if (idempotencyRecord) {
                return JSON.parse(idempotencyRecord.responseBody);
            }
            return response;
        }
        const cachedRecord = await this.prisma.idempotencyRecord.findUnique({
            where: { key: `${merchantId}:${idempotencyKey}` },
        });
        if (cachedRecord) {
            return JSON.parse(cachedRecord.responseBody);
        }
        const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant || merchant.status !== 'ACTIVE') {
            throw new common_1.BadRequestException({
                error: 'MERCHANT_DISABLED',
                code: 'MERCHANT_DISABLED',
                message: 'Merchant account is not active',
            });
        }
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product || product.status !== 'ACTIVE') {
            throw new common_1.NotFoundException({
                error: 'NOT_FOUND',
                code: 'PRODUCT_NOT_FOUND',
                message: 'Product not found or inactive',
            });
        }
        const allowedIds = JSON.parse(merchant.allowedProductIds || '[]');
        if (allowedIds.length > 0 && !allowedIds.includes(productId)) {
            throw new common_1.BadRequestException({
                error: 'FORBIDDEN',
                code: 'PRODUCT_NOT_ALLOWED',
                message: 'Merchant does not have access to this product',
            });
        }
        let useMerchantPool = requestedSource === 'MERCHANT' || requestedSource === 'AUTO';
        let merchantStock = [];
        let dcvStock = [];
        if (useMerchantPool) {
            merchantStock = (await this.allocationEngine.getAvailableStock(this.prisma, productId, merchantId))
                .filter((s) => s.availableCount > 0);
            if (merchantStock.length === 0) {
                if (requestedSource === 'MERCHANT') {
                    const failedReq = await this.prisma.fulfillmentRequest.create({
                        data: {
                            merchantId,
                            productId,
                            amount,
                            currency,
                            idempotencyKey,
                            referenceId,
                            status: 'FAILED',
                            failureReason: 'No available merchant-owned stock for this product',
                            sandbox: sandbox || false,
                            inventorySource: 'MERCHANT',
                        },
                    });
                    await this.auditService.log({
                        actorType: actorType || 'SYSTEM',
                        actorId: actorId || merchantId,
                        action: 'fulfillment.failed',
                        entity: 'FulfillmentRequest',
                        entityId: failedReq.id,
                        metadata: { reason: 'INSUFFICIENT_STOCK', productId, amount, source: 'MERCHANT' },
                        ip,
                    });
                    this.webhookService.queueWebhookEvent(merchantId, 'fulfillment.failed', {
                        fulfillment_id: failedReq.id,
                        reference_id: referenceId,
                        reason: 'INSUFFICIENT_STOCK',
                    }).catch(() => { });
                    throw new common_1.BadRequestException({
                        error: 'INSUFFICIENT_STOCK',
                        code: 'INSUFFICIENT_STOCK',
                        message: 'No available merchant-owned stock for this product',
                    });
                }
                useMerchantPool = false;
            }
        }
        if (!useMerchantPool) {
            dcvStock = (await this.allocationEngine.getAvailableStock(this.prisma, productId, null))
                .filter((s) => s.availableCount > 0);
            if (dcvStock.length === 0) {
                if (requestedSource === 'AUTO') {
                    dcvStock = (await this.allocationEngine.getAvailableStock(this.prisma, productId, '__ALL__'))
                        .filter((s) => s.availableCount > 0);
                }
            }
            if (dcvStock.length === 0) {
                const failedReq = await this.prisma.fulfillmentRequest.create({
                    data: {
                        merchantId,
                        productId,
                        amount,
                        currency,
                        idempotencyKey,
                        referenceId,
                        status: 'FAILED',
                        failureReason: 'No available stock for this product',
                        sandbox: sandbox || false,
                        inventorySource: 'DCV',
                    },
                });
                await this.auditService.log({
                    actorType: actorType || 'SYSTEM',
                    actorId: actorId || merchantId,
                    action: 'fulfillment.failed',
                    entity: 'FulfillmentRequest',
                    entityId: failedReq.id,
                    metadata: { reason: 'INSUFFICIENT_STOCK', productId, amount },
                    ip,
                });
                this.webhookService.queueWebhookEvent(merchantId, 'fulfillment.failed', {
                    fulfillment_id: failedReq.id,
                    reference_id: referenceId,
                    reason: 'INSUFFICIENT_STOCK',
                }).catch(() => { });
                throw new common_1.BadRequestException({
                    error: 'INSUFFICIENT_STOCK',
                    code: 'INSUFFICIENT_STOCK',
                    message: 'No available stock for this product',
                });
            }
        }
        const activeStock = useMerchantPool ? merchantStock : dcvStock;
        const activePoolMerchantId = useMerchantPool ? merchantId : null;
        let combination = null;
        let usedVariantPreset = false;
        const productType = product.productType || 'NORMAL';
        this.logger.log(`[Fulfillment] Product "${product.name}" type: ${productType}, amount: ${amount}`);
        if (variantId) {
            const presetCombos = await this.prisma.fulfillmentCombination.findMany({
                where: { variantId, active: true },
                include: { items: { include: { denomination: true } } },
                orderBy: { priority: 'asc' },
            });
            for (const combo of presetCombos) {
                let allSufficient = combo.items.length > 0;
                const items = [];
                for (const item of combo.items) {
                    const stockEntry = activeStock.find((s) => s.denominationId === item.denominationId);
                    const availableCount = stockEntry ? stockEntry.availableCount : 0;
                    if (availableCount < item.quantity) {
                        allSufficient = false;
                        this.logger.warn(`[Fulfillment] Variant preset "${combo.name}" — denomination $${item.denomination.faceValue} needs ${item.quantity}, has ${availableCount} available.`);
                        break;
                    }
                    items.push({
                        denominationId: item.denominationId,
                        faceValue: Number(item.denomination.faceValue),
                        count: item.quantity,
                    });
                }
                if (allSufficient) {
                    combination = items;
                    usedVariantPreset = true;
                    this.logger.log(`[Fulfillment] Variant preset "${combo.name}" ready: ${items.map((i) => `$${i.faceValue} x${i.count}`).join(' + ')}`);
                    break;
                }
            }
            if (!combination && presetCombos.length > 0) {
                this.logger.warn(`[Fulfillment] ${presetCombos.length} preset(s) exist for variant ${variantId} but none are fulfillable right now.`);
            }
        }
        let essentialsConfigured = false;
        if (!combination && productType === 'ESSENTIALS') {
            const deliveryItems = await this.prisma.essentialsDeliveryItem.findMany({
                where: { productId },
                include: { denomination: true },
            });
            if (deliveryItems.length === 0) {
                this.logger.warn(`[Fulfillment] No Essentials delivery configuration for product ${productId} — falling back to amount-based denomination matching.`);
            }
            else {
                essentialsConfigured = true;
                let allSufficient = true;
                const items = [];
                for (const rule of deliveryItems) {
                    const stockEntry = activeStock.find((s) => s.denominationId === rule.denominationId);
                    const availableCount = stockEntry ? stockEntry.availableCount : 0;
                    if (availableCount < rule.quantity) {
                        allSufficient = false;
                        this.logger.warn(`[Fulfillment] Essentials rule for product ${productId} — denomination $${rule.denomination.faceValue} needs ${rule.quantity}, has ${availableCount} available.`);
                        break;
                    }
                    items.push({
                        denominationId: rule.denominationId,
                        faceValue: Number(rule.denomination.faceValue),
                        count: rule.quantity,
                    });
                }
                if (allSufficient) {
                    combination = items;
                    this.logger.log(`[Fulfillment] Essentials delivery rule ready for product ${productId}: ${items.map((i) => `$${i.faceValue} x${i.count}`).join(' + ')}`);
                }
            }
        }
        if (!combination && !essentialsConfigured) {
            if (exactDenominationId) {
                const exactDenom = activeStock.find((d) => d.denominationId === exactDenominationId);
                if (exactDenom && exactDenom.availableCount > 0) {
                    const remainder = amount % exactDenom.faceValue;
                    if (remainder === 0) {
                        const count = amount / exactDenom.faceValue;
                        if (count <= exactDenom.availableCount) {
                            combination = [{ denominationId: exactDenominationId, faceValue: exactDenom.faceValue, count }];
                        }
                    }
                }
                if (!combination) {
                    this.logger.warn(`[Fulfillment] Exact denomination ${exactDenominationId} not available or does not evenly divide ${amount} for NORMAL product. No auto-combination fallback.`);
                }
            }
            else {
                const exactMatch = activeStock.find((d) => d.faceValue === amount && d.availableCount > 0);
                if (exactMatch) {
                    combination = [{ denominationId: exactMatch.denominationId, faceValue: exactMatch.faceValue, count: 1 }];
                }
                if (!combination) {
                    const fallbackCombo = this.allocationEngine.findBestCombination(activeStock, amount);
                    if (fallbackCombo) {
                        combination = fallbackCombo;
                        this.logger.log(`[Fulfillment] Combination fallback for amount ${amount}: ${fallbackCombo.map((c) => `$${c.faceValue} x${c.count}`).join(' + ')}`);
                    }
                    else {
                        this.logger.warn(`[Fulfillment] No denomination combination sums to ${amount} for NORMAL product.`);
                    }
                }
            }
        }
        if (!combination) {
            const failedReq = await this.prisma.fulfillmentRequest.create({
                data: {
                    merchantId,
                    productId,
                    amount,
                    currency,
                    idempotencyKey,
                    referenceId,
                    status: 'FAILED',
                    failureReason: `No denomination combination sums to ${amount}`,
                    sandbox: sandbox || false,
                },
            });
            await this.auditService.log({
                actorType: actorType || 'SYSTEM',
                actorId: actorId || merchantId,
                action: 'fulfillment.failed',
                entity: 'FulfillmentRequest',
                entityId: failedReq.id,
                metadata: { reason: 'INSUFFICIENT_STOCK', productId, amount },
                ip,
            });
            this.webhookService.queueWebhookEvent(merchantId, 'fulfillment.failed', {
                fulfillment_id: failedReq.id,
                reference_id: referenceId,
                reason: 'INSUFFICIENT_STOCK',
            }).catch(() => { });
            throw new common_1.BadRequestException({
                error: 'INSUFFICIENT_STOCK',
                code: 'INSUFFICIENT_STOCK',
                message: `No combination of available denominations sums to ${amount}`,
            });
        }
        let totalCost = productType === 'ESSENTIALS' || usedVariantPreset
            ? amount
            : combination.reduce((acc, c) => acc + c.faceValue * c.count, 0);
        if (productType !== 'ESSENTIALS' && !usedVariantPreset && totalCost !== amount) {
            this.logger.error(`[Fulfillment] Combination total ${totalCost} does not match requested amount ${amount}`);
            const failedReq = await this.prisma.fulfillmentRequest.create({
                data: {
                    merchantId,
                    productId,
                    amount,
                    currency,
                    idempotencyKey,
                    referenceId,
                    status: 'FAILED',
                    failureReason: `Combination total ${totalCost} does not match requested amount ${amount}`,
                    sandbox: sandbox || false,
                },
            });
            await this.auditService.log({
                actorType: actorType || 'SYSTEM',
                actorId: actorId || merchantId,
                action: 'fulfillment.failed',
                entity: 'FulfillmentRequest',
                entityId: failedReq.id,
                metadata: { reason: 'AMOUNT_MISMATCH', requested: amount, combinationTotal: totalCost },
                ip,
            });
            throw new common_1.BadRequestException({
                error: 'INSUFFICIENT_INVENTORY',
                code: 'AMOUNT_MISMATCH',
                message: `No combination of available denominations exactly sums to ${amount}`,
            });
        }
        const skipWallet = sandbox || useMerchantPool || actorType === 'ADMIN';
        if (!skipWallet) {
            if (Number(merchant.walletBalance) < totalCost) {
                const failedReq = await this.prisma.fulfillmentRequest.create({
                    data: {
                        merchantId,
                        productId,
                        amount,
                        currency,
                        idempotencyKey,
                        referenceId,
                        status: 'FAILED',
                        failureReason: 'Insufficient wallet balance',
                        sandbox: sandbox || false,
                    },
                });
                await this.auditService.log({
                    actorType: actorType || 'SYSTEM',
                    actorId: actorId || merchantId,
                    action: 'fulfillment.failed',
                    entity: 'FulfillmentRequest',
                    entityId: failedReq.id,
                    metadata: { reason: 'INSUFFICIENT_WALLET', balance: merchant.walletBalance, required: totalCost },
                    ip,
                });
                this.webhookService.queueWebhookEvent(merchantId, 'fulfillment.failed', {
                    fulfillment_id: failedReq.id,
                    reference_id: referenceId,
                    reason: 'INSUFFICIENT_WALLET',
                }).catch(() => { });
                throw new common_1.BadRequestException({
                    error: 'INSUFFICIENT_WALLET',
                    code: 'INSUFFICIENT_WALLET',
                    message: `Insufficient wallet balance. Required: ${totalCost}, Available: ${merchant.walletBalance}`,
                });
            }
        }
        const reservationTtl = this.configService.get('RESERVATION_TTL_MINUTES', 15);
        const MAX_RETRIES = 3;
        let result;
        let lastError;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (attempt > 1) {
                    this.logger.log(`[Fulfillment] Retry attempt ${attempt}/${MAX_RETRIES} for ${idempotencyKey}`);
                    if (productType === 'ESSENTIALS') {
                        const deliveryItems = await this.prisma.essentialsDeliveryItem.findMany({
                            where: { productId },
                            include: { denomination: true },
                        });
                        if (deliveryItems.length === 0) {
                            throw new common_1.BadRequestException({
                                error: 'INSUFFICIENT_STOCK',
                                code: 'NO_DELIVERY_CONFIG',
                                message: 'Essentials product has no delivery configuration',
                            });
                        }
                        const retryStock = await this.allocationEngine.getAvailableStock(this.prisma, productId, activePoolMerchantId);
                        const retryItems = [];
                        for (const rule of deliveryItems) {
                            const stockEntry = retryStock.find((s) => s.denominationId === rule.denominationId);
                            const availableCount = stockEntry ? stockEntry.availableCount : 0;
                            if (availableCount < rule.quantity) {
                                throw new common_1.BadRequestException({
                                    error: 'INSUFFICIENT_STOCK',
                                    code: 'INSUFFICIENT_STOCK',
                                    message: `Denomination $${rule.denomination.faceValue} needs ${rule.quantity}, only ${availableCount} available after retry`,
                                });
                            }
                            retryItems.push({ denominationId: rule.denominationId, faceValue: Number(rule.denomination.faceValue), count: rule.quantity });
                        }
                        combination.length = 0;
                        combination.push(...retryItems);
                    }
                    else {
                        const retryStock = await this.allocationEngine.getAvailableStock(this.prisma, productId, activePoolMerchantId);
                        const retryDenoms = retryStock.filter((s) => s.availableCount > 0);
                        if (retryDenoms.length === 0) {
                            throw new common_1.BadRequestException({
                                error: 'INSUFFICIENT_STOCK',
                                code: 'INSUFFICIENT_STOCK',
                                message: 'No available stock for this product after retry',
                            });
                        }
                        let retryCombo = null;
                        if (exactDenominationId) {
                            const exactDenom = retryDenoms.find((d) => d.denominationId === exactDenominationId);
                            if (exactDenom && exactDenom.availableCount > 0) {
                                const remainder = amount % exactDenom.faceValue;
                                if (remainder === 0) {
                                    const count = amount / exactDenom.faceValue;
                                    if (count <= exactDenom.availableCount) {
                                        retryCombo = [{ denominationId: exactDenominationId, faceValue: exactDenom.faceValue, count }];
                                    }
                                }
                            }
                        }
                        else {
                            const exactMatch = retryDenoms.find((d) => d.faceValue === amount && d.availableCount > 0);
                            if (exactMatch) {
                                retryCombo = [{ denominationId: exactMatch.denominationId, faceValue: exactMatch.faceValue, count: 1 }];
                            }
                        }
                        if (!retryCombo) {
                            throw new common_1.BadRequestException({
                                error: 'INSUFFICIENT_STOCK',
                                code: 'INSUFFICIENT_STOCK',
                                message: `No denomination combination sums to ${amount} after retry`,
                            });
                        }
                        combination.length = 0;
                        combination.push(...retryCombo);
                        totalCost = combination.reduce((acc, c) => acc + c.faceValue * c.count, 0);
                        if (totalCost !== amount) {
                            throw new common_1.BadRequestException({
                                error: 'INSUFFICIENT_INVENTORY',
                                code: 'AMOUNT_MISMATCH',
                                message: `Combination total ${totalCost} does not match requested amount ${amount} after retry`,
                            });
                        }
                    }
                }
                result = await this.prisma.$transaction(async (tx) => {
                    const fulfillmentReq = await tx.fulfillmentRequest.create({
                        data: {
                            merchantId,
                            productId,
                            amount,
                            currency,
                            idempotencyKey,
                            referenceId,
                            status: 'PENDING',
                            sandbox: sandbox || false,
                            customerEmail: customerEmail || null,
                            customerName: customerName || null,
                            customerAddress: customerAddress || null,
                            inventorySource: useMerchantPool ? 'MERCHANT' : 'DCV',
                        },
                    });
                    let allocationResults;
                    try {
                        allocationResults = await this.allocationEngine.reserveCodes(tx, fulfillmentReq.id, combination, reservationTtl, activePoolMerchantId);
                    }
                    catch (err) {
                        await this.allocationEngine.releaseReservation(tx, fulfillmentReq.id);
                        throw err;
                    }
                    let updatedMerchant;
                    if (skipWallet) {
                        updatedMerchant = await tx.merchant.findUnique({ where: { id: merchantId } });
                    }
                    else {
                        updatedMerchant = await tx.merchant.update({
                            where: { id: merchantId },
                            data: {
                                walletBalance: { decrement: totalCost },
                            },
                        });
                        if (Number(updatedMerchant.walletBalance) < 0) {
                            throw new common_1.BadRequestException({
                                error: 'INSUFFICIENT_WALLET',
                                code: 'NEGATIVE_BALANCE_GUARD',
                                message: `Transaction would result in negative balance. This should not happen — pre-check failed.`,
                            });
                        }
                        await tx.walletTransaction.create({
                            data: {
                                merchantId,
                                type: 'DEBIT',
                                amount: totalCost,
                                balanceAfter: updatedMerchant.walletBalance,
                                referenceId: fulfillmentReq.id,
                                fulfillmentId: fulfillmentReq.id,
                            },
                        });
                        const adminWalletId = await this.walletService.getOrCreateAdminWallet();
                        const updatedAdminWallet = await tx.adminWallet.update({
                            where: { id: adminWalletId },
                            data: { balance: { increment: totalCost } },
                        });
                        await tx.adminWalletTransaction.create({
                            data: {
                                adminWalletId,
                                type: 'CREDIT',
                                amount: totalCost,
                                balanceAfter: updatedAdminWallet.balance,
                                referenceId: fulfillmentReq.id,
                                source: 'FULFILLMENT',
                                description: `Fulfillment revenue from merchant ${merchantId}`,
                            },
                        });
                    }
                    const allAllocatedIds = allocationResults.flatMap((r) => r.codeItemIds);
                    if (allAllocatedIds.length === 0) {
                        await this.allocationEngine.releaseReservation(tx, fulfillmentReq.id);
                        throw new common_1.BadRequestException({
                            error: 'ALLOCATION_FAILED',
                            code: 'NO_CODES_ALLOCATED',
                            message: 'No code items were allocated — combination produced zero results',
                        });
                    }
                    await this.allocationEngine.confirmAllocation(tx, fulfillmentReq.id, allocationResults);
                    const updatedReq = await tx.fulfillmentRequest.update({
                        where: { id: fulfillmentReq.id },
                        data: { status: 'ALLOCATED', walletCharged: !skipWallet },
                        include: { allocations: true },
                    });
                    const rawToken = this.encryptionService.generateToken(32);
                    const tokenHash = this.encryptionService.hashToken(rawToken);
                    await tx.deliveryToken.create({
                        data: {
                            fulfillmentId: fulfillmentReq.id,
                            tokenHash,
                        },
                    });
                    return {
                        fulfillmentReq: updatedReq,
                        allocationResults,
                        walletBalanceAfter: updatedMerchant.walletBalance,
                        deliveryToken: rawToken,
                    };
                }, { timeout: 30000 });
                break;
            }
            catch (err) {
                lastError = err;
                const isStockConflict = err?.response?.code === 'STOCK_CONFLICT' ||
                    err?.response?.code === 'INSUFFICIENT_STOCK' ||
                    err?.message?.includes('Transaction already closed');
                if (isStockConflict && attempt < MAX_RETRIES) {
                    this.logger.warn(`[Fulfillment] Stock conflict on attempt ${attempt}, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                    continue;
                }
                throw err;
            }
        }
        if (!result) {
            throw lastError || new Error('Fulfillment failed after retries');
        }
        await this.auditService.log({
            actorType: actorType || 'SYSTEM',
            actorId: actorId || merchantId,
            action: 'fulfillment.allocated',
            entity: 'FulfillmentRequest',
            entityId: result.fulfillmentReq.id,
            metadata: {
                productId,
                amount,
                allocation: combination.map((c) => `$${c.faceValue} x${c.count}`),
                walletBalanceAfter: result.walletBalanceAfter,
            },
            ip,
        });
        this.webhookService.queueWebhookEvent(merchantId, 'fulfillment.allocated', {
            fulfillment_id: result.fulfillmentReq.id,
            reference_id: referenceId,
            allocation: combination.map((c) => `$${c.faceValue} x${c.count}`),
        }).catch(() => { });
        const baseUrl = this.configService.get('APP_URL', 'http://localhost:3000');
        const deliveryLink = `${baseUrl}/api/v1/reveal/${result.deliveryToken}`;
        const purchaseDate = result.fulfillmentReq.createdAt.toISOString();
        if (customerEmail) {
            const codesDelivered = combination.reduce((acc, c) => acc + c.count, 0);
            this.orderDigestService.enqueue(customerEmail, {
                productName: product.name,
                fulfillmentId: result.fulfillmentReq.id,
                referenceId,
                amount,
                currency,
                codesDelivered,
                deliveryLink,
            }, { customerName: customerName || undefined, merchantName: merchant.name });
        }
        if (actorType !== 'ADMIN' && customerEmail && merchant && product) {
            this.emailService.sendMerchantPurchaseNotification(merchant.email, merchant.name, customerName || customerEmail, customerEmail, product.name, result.fulfillmentReq.id, purchaseDate, 'ALLOCATED', product.region).catch((err) => {
                this.logger.error(`Failed to send merchant purchase notification: ${err.message}`);
            });
        }
        else if (actorType !== 'ADMIN' && merchant && product) {
            this.emailService.sendDeliveryLinkEmail(merchant.email, merchant.name, product.name, deliveryLink, result.fulfillmentReq.id).catch((err) => {
                this.logger.error(`Failed to send delivery link email: ${err.message}`);
            });
        }
        const response = {
            fulfillment_id: result.fulfillmentReq.id,
            status: 'ALLOCATED',
            allocation: combination.map((c) => `$${c.faceValue}`),
            delivery_link: deliveryLink,
            wallet_balance_after: result.walletBalanceAfter,
        };
        const idempotencyTtl = this.configService.get('IDEMPOTENCY_KEY_TTL_HOURS', 24);
        await this.prisma.idempotencyRecord.create({
            data: {
                key: `${merchantId}:${idempotencyKey}`,
                merchantId,
                requestBodyHash: '',
                responseStatus: 200,
                responseBody: JSON.stringify(response),
                expiresAt: new Date(Date.now() + idempotencyTtl * 60 * 60 * 1000),
            },
        }).catch(() => { });
        return response;
    }
    async getFulfillmentStatus(fulfillmentId, merchantId) {
        const req = await this.prisma.fulfillmentRequest.findFirst({
            where: { id: fulfillmentId, merchantId },
            include: {
                allocations: true,
                deliveryToken: true,
            },
        });
        if (!req) {
            throw new common_1.NotFoundException({
                error: 'NOT_FOUND',
                code: 'FULFILLMENT_NOT_FOUND',
                message: 'Fulfillment request not found',
            });
        }
        return this.formatFulfillmentResponse(req);
    }
    async getDeliveryLink(fulfillmentId, merchantId) {
        const req = await this.prisma.fulfillmentRequest.findFirst({
            where: { id: fulfillmentId, merchantId },
            include: { deliveryToken: true },
        });
        if (!req) {
            throw new common_1.NotFoundException({
                error: 'NOT_FOUND',
                code: 'FULFILLMENT_NOT_FOUND',
                message: 'Fulfillment request not found',
            });
        }
        if (req.status !== 'ALLOCATED' && req.status !== 'DELIVERED') {
            throw new common_1.BadRequestException({
                error: 'NOT_READY',
                code: 'NOT_ALLOCATED',
                message: 'Fulfillment has not been allocated yet',
            });
        }
        if (!req.deliveryToken) {
            throw new common_1.NotFoundException({
                error: 'NOT_FOUND',
                code: 'NO_DELIVERY_TOKEN',
                message: 'Delivery token not found',
            });
        }
        return {
            fulfillment_id: req.id,
            status: req.status,
            has_delivery_token: !!req.deliveryToken,
            revealed_at: req.deliveryToken?.revealedAt || null,
            is_revealed: !!req.deliveryToken?.revealedAt,
        };
    }
    async getOrderStatus(referenceId, merchantId) {
        const req = await this.prisma.fulfillmentRequest.findFirst({
            where: { referenceId, merchantId },
            include: { deliveryToken: true },
        });
        if (!req) {
            throw new common_1.NotFoundException({
                error: 'NOT_FOUND',
                code: 'ORDER_NOT_FOUND',
                message: 'Order not found',
            });
        }
        return {
            fulfillment_id: req.id,
            reference_id: req.referenceId,
            status: req.status,
            created_at: req.createdAt,
            revealed: req.deliveryToken?.revealedAt ? true : false,
            revealed_at: req.deliveryToken?.revealedAt || null,
        };
    }
    async reverseFulfillment(fulfillmentId, adminId, ip) {
        const req = await this.prisma.fulfillmentRequest.findUnique({
            where: { id: fulfillmentId },
            include: { walletTxn: true, allocations: true },
        });
        if (!req) {
            throw new common_1.NotFoundException('Fulfillment request not found');
        }
        if (req.status === 'DELIVERED') {
            throw new common_1.BadRequestException({
                error: 'CANNOT_REVERSE',
                code: 'ALREADY_DELIVERED',
                message: 'Cannot reverse a fulfillment that has already been delivered to the customer',
            });
        }
        if (req.status === 'REVERSED') {
            throw new common_1.ConflictException('Fulfillment already reversed');
        }
        const refundAmount = req.walletTxn ? req.walletTxn.amount : 0;
        const result = await this.prisma.$transaction(async (tx) => {
            await this.allocationEngine.reverseAllocation(tx, fulfillmentId);
            const updatedMerchant = await tx.merchant.update({
                where: { id: req.merchantId },
                data: { walletBalance: { increment: refundAmount } },
            });
            await tx.walletTransaction.create({
                data: {
                    merchantId: req.merchantId,
                    type: 'REFUND',
                    amount: refundAmount,
                    balanceAfter: updatedMerchant.walletBalance,
                    referenceId: fulfillmentId,
                    fulfillmentId: fulfillmentId,
                },
            });
            const adminWalletId = await this.walletService.getOrCreateAdminWallet();
            const updatedAdminWallet = await tx.adminWallet.update({
                where: { id: adminWalletId },
                data: { balance: { decrement: refundAmount } },
            });
            await tx.adminWalletTransaction.create({
                data: {
                    adminWalletId,
                    type: 'DEBIT',
                    amount: refundAmount,
                    balanceAfter: updatedAdminWallet.balance,
                    referenceId: fulfillmentId,
                    source: 'REFUND',
                    description: `Reversal of fulfillment ${fulfillmentId}`,
                },
            });
            const updatedReq = await tx.fulfillmentRequest.update({
                where: { id: fulfillmentId },
                data: { status: 'REVERSED' },
            });
            return updatedReq;
        });
        await this.auditService.log({
            actorType: 'ADMIN',
            actorId: adminId,
            action: 'fulfillment.reversed',
            entity: 'FulfillmentRequest',
            entityId: fulfillmentId,
            metadata: { refundAmount, merchantId: req.merchantId },
            ip,
        });
        this.webhookService.queueWebhookEvent(req.merchantId, 'fulfillment.reversed', {
            fulfillment_id: fulfillmentId,
            reference_id: req.referenceId,
            refund_amount: refundAmount,
        }).catch(() => { });
        return { success: true, fulfillment_id: fulfillmentId, status: 'REVERSED' };
    }
    formatFulfillmentResponse(req) {
        const baseUrl = this.configService.get('APP_URL', 'http://localhost:3000');
        return {
            fulfillment_id: req.id,
            status: req.status,
            reference_id: req.referenceId,
            created_at: req.createdAt,
            allocation: req.allocations?.[0]?.codeItemIds
                ? [`${JSON.parse(req.allocations[0].codeItemIds || '[]').length} codes`]
                : [],
            revealed: req.deliveryToken?.revealedAt ? true : false,
        };
    }
    async fulfillPendingSupplierRequests(productId, denominationId) {
        const where = { status: 'PENDING_SUPPLIER' };
        if (productId)
            where.productId = productId;
        const pending = await this.prisma.fulfillmentRequest.findMany({
            where,
            orderBy: { createdAt: 'asc' },
            take: 100,
        });
        const results = [];
        for (const req of pending) {
            try {
                const stock = await this.allocationEngine.getAvailableStock(this.prisma, req.productId);
                const availableDenominations = stock.filter((s) => s.availableCount > 0);
                if (availableDenominations.length === 0) {
                    results.push({ id: req.id, success: false, reason: 'Still no stock' });
                    continue;
                }
                const combination = this.allocationEngine.findBestCombination(availableDenominations, Number(req.amount));
                if (!combination) {
                    results.push({ id: req.id, success: false, reason: 'No matching denomination combination' });
                    continue;
                }
                const totalCost = combination.reduce((acc, c) => acc + c.faceValue * c.count, 0);
                if (totalCost !== Number(req.amount)) {
                    results.push({ id: req.id, success: false, reason: `Combination total ${totalCost} does not match requested amount ${req.amount}` });
                    continue;
                }
                const reservationTtl = this.configService.get('RESERVATION_TTL_MINUTES', 15);
                const result = await this.prisma.$transaction(async (tx) => {
                    let allocationResults;
                    try {
                        allocationResults = await this.allocationEngine.reserveCodes(tx, req.id, combination, reservationTtl);
                    }
                    catch (err) {
                        await this.allocationEngine.releaseReservation(tx, req.id);
                        throw err;
                    }
                    const allAllocatedIds = allocationResults.flatMap((r) => r.codeItemIds);
                    if (allAllocatedIds.length === 0) {
                        await this.allocationEngine.releaseReservation(tx, req.id);
                        throw new common_1.BadRequestException({
                            error: 'ALLOCATION_FAILED',
                            code: 'NO_CODES_ALLOCATED',
                            message: 'No code items were allocated — combination produced zero results',
                        });
                    }
                    const updatedMerchant = await tx.merchant.update({
                        where: { id: req.merchantId },
                        data: { walletBalance: { decrement: totalCost } },
                    });
                    await tx.walletTransaction.create({
                        data: {
                            merchantId: req.merchantId,
                            type: 'DEBIT',
                            amount: totalCost,
                            balanceAfter: updatedMerchant.walletBalance,
                            referenceId: req.id,
                            fulfillmentId: req.id,
                        },
                    });
                    const adminWalletId = await this.walletService.getOrCreateAdminWallet();
                    const updatedAdminWallet = await tx.adminWallet.update({
                        where: { id: adminWalletId },
                        data: { balance: { increment: totalCost } },
                    });
                    await tx.adminWalletTransaction.create({
                        data: {
                            adminWalletId,
                            type: 'CREDIT',
                            amount: totalCost,
                            balanceAfter: updatedAdminWallet.balance,
                            referenceId: req.id,
                            source: 'FULFILLMENT',
                            description: `Supplier auto-fulfillment revenue from merchant ${req.merchantId}`,
                        },
                    });
                    await this.allocationEngine.confirmAllocation(tx, req.id, allocationResults);
                    const updatedReq = await tx.fulfillmentRequest.update({
                        where: { id: req.id },
                        data: { status: 'ALLOCATED' },
                        include: { allocations: true },
                    });
                    const rawToken = this.encryptionService.generateToken(32);
                    const tokenHash = this.encryptionService.hashToken(rawToken);
                    await tx.deliveryToken.create({
                        data: {
                            fulfillmentId: req.id,
                            tokenHash,
                        },
                    });
                    return {
                        fulfillmentReq: updatedReq,
                        walletBalanceAfter: updatedMerchant.walletBalance,
                        deliveryToken: rawToken,
                    };
                });
                await this.auditService.log({
                    actorType: 'SYSTEM',
                    actorId: 'system',
                    action: 'fulfillment.supplier_auto_allocated',
                    entity: 'FulfillmentRequest',
                    entityId: req.id,
                    metadata: {
                        productId: req.productId,
                        amount: req.amount,
                        allocation: combination.map((c) => `$${c.faceValue} x${c.count}`),
                        walletBalanceAfter: result.walletBalanceAfter,
                    },
                });
                this.webhookService.queueWebhookEvent(req.merchantId, 'fulfillment.allocated', {
                    fulfillment_id: req.id,
                    reference_id: req.referenceId,
                    allocation: combination.map((c) => `$${c.faceValue} x${c.count}`),
                }).catch(() => { });
                results.push({ id: req.id, success: true });
            }
            catch (err) {
                results.push({ id: req.id, success: false, reason: err.message });
            }
        }
        if (results.length > 0) {
            this.logger.log(`Auto-fulfilled ${results.filter((r) => r.success).length}/${results.length} pending supplier requests`);
        }
        return results;
    }
    async sweepExpiredReservations() {
        const result = await this.prisma.$transaction(async (tx) => {
            const expired = await tx.codeItem.findMany({
                where: {
                    status: 'RESERVED',
                    reservedUntil: { lt: new Date() },
                },
                select: { id: true, reservedByReqId: true },
            });
            if (expired.length === 0)
                return { count: 0 };
            const codeItemIds = expired.map((c) => c.id);
            const reqIds = [...new Set(expired.map((c) => c.reservedByReqId).filter(Boolean))];
            await tx.codeItem.updateMany({
                where: { id: { in: codeItemIds } },
                data: {
                    status: 'AVAILABLE',
                    reservedUntil: null,
                    reservedByReqId: null,
                },
            });
            for (const reqId of reqIds) {
                await tx.fulfillmentRequest.updateMany({
                    where: { id: reqId, status: 'PENDING' },
                    data: { status: 'FAILED', failureReason: 'Reservation expired' },
                });
            }
            return { count: expired.length };
        });
        if (result.count > 0) {
            this.logger.log(`Swept ${result.count} expired reservations`);
        }
        return result;
    }
};
exports.FulfillmentService = FulfillmentService;
exports.FulfillmentService = FulfillmentService = FulfillmentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => webhook_service_1.WebhookService))),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        encryption_service_1.EncryptionService,
        audit_service_1.AuditService,
        allocation_engine_service_1.AllocationEngineService,
        webhook_service_1.WebhookService,
        email_service_1.EmailService,
        order_digest_service_1.OrderDigestService,
        wallet_service_1.WalletService])
], FulfillmentService);
//# sourceMappingURL=fulfillment.service.js.map