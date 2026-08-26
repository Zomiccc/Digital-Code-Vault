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
var DeliveryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliveryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const encryption_service_1 = require("../encryption/encryption.service");
const audit_service_1 = require("../audit/audit.service");
const webhook_service_1 = require("../webhooks/webhook.service");
const email_service_1 = require("../email/email.service");
const config_1 = require("@nestjs/config");
let DeliveryService = DeliveryService_1 = class DeliveryService {
    prisma;
    encryptionService;
    auditService;
    webhookService;
    emailService;
    configService;
    logger = new common_1.Logger(DeliveryService_1.name);
    constructor(prisma, encryptionService, auditService, webhookService, emailService, configService) {
        this.prisma = prisma;
        this.encryptionService = encryptionService;
        this.auditService = auditService;
        this.webhookService = webhookService;
        this.emailService = emailService;
        this.configService = configService;
    }
    async findDeliveryToken(token, includeMerchant = false) {
        const tokenHash = this.encryptionService.hashToken(token);
        const include = {
            fulfillment: {
                include: {
                    product: true,
                    allocations: true,
                    ...(includeMerchant ? { merchant: true } : {}),
                },
            },
        };
        let deliveryToken = await this.prisma.deliveryToken.findUnique({
            where: { tokenHash },
            include,
        });
        if (!deliveryToken) {
            deliveryToken = await this.prisma.deliveryToken.findUnique({
                where: { tokenHash: token },
                include,
            });
        }
        return deliveryToken;
    }
    async getDeliveryInfo(token) {
        const deliveryToken = await this.findDeliveryToken(token);
        if (!deliveryToken) {
            throw new common_1.NotFoundException({
                error: 'NOT_FOUND',
                code: 'INVALID_TOKEN',
                message: 'Invalid or expired delivery link',
            });
        }
        const isRevealed = !!deliveryToken.revealedAt;
        if (deliveryToken.fulfillment.customerEmail) {
            const customerEmail = deliveryToken.fulfillment.customerEmail;
            const customerName = deliveryToken.fulfillment.customerName || customerEmail;
            const orderId = deliveryToken.fulfillment.referenceId || deliveryToken.fulfillmentId;
            const productName = deliveryToken.fulfillment.product.name;
            const amount = deliveryToken.fulfillment.amount
                ? `${deliveryToken.fulfillment.currency || 'USD'} ${deliveryToken.fulfillment.amount}`
                : 'N/A';
            const baseUrl = this.configService.get('APP_URL', 'http://localhost:3000');
            const deliveryLink = `${baseUrl}/api/v1/reveal/${token}`;
            this.emailService.sendDeliveryReadyEmail(customerEmail, customerName, orderId, productName, amount, deliveryLink).then((success) => {
                if (success) {
                    this.logger.log(`[DELIVERY EMAIL] Sent successfully — customer: ${customerEmail}, order: ${orderId}, token: ${deliveryToken.id.slice(0, 8)}..., time: ${new Date().toISOString()}`);
                }
                else {
                    this.logger.warn(`[DELIVERY EMAIL] Send returned false — customer: ${customerEmail}, order: ${orderId}, token: ${deliveryToken.id.slice(0, 8)}...`);
                }
            }).catch((err) => {
                this.logger.error(`[DELIVERY EMAIL] Failed to send — customer: ${customerEmail}, order: ${orderId}, error: ${err.message}`);
            });
        }
        return {
            fulfillment_id: deliveryToken.fulfillmentId,
            product_name: deliveryToken.fulfillment.product.name,
            reference_id: deliveryToken.fulfillment.referenceId,
            customer_email: deliveryToken.fulfillment.customerEmail,
            customer_name: deliveryToken.fulfillment.customerName,
            is_revealed: isRevealed,
            revealed_at: deliveryToken.revealedAt,
            status: deliveryToken.fulfillment.status,
        };
    }
    async revealCode(token, ip) {
        const deliveryToken = await this.findDeliveryToken(token, true);
        if (!deliveryToken) {
            throw new common_1.NotFoundException({
                error: 'NOT_FOUND',
                code: 'INVALID_TOKEN',
                message: 'Invalid or expired delivery link',
            });
        }
        const allocation = deliveryToken.fulfillment.allocations[0];
        if (!allocation) {
            throw new common_1.NotFoundException({
                error: 'NO_ALLOCATION',
                code: 'NO_ALLOCATION',
                message: 'No codes allocated to this fulfillment',
            });
        }
        const ids = JSON.parse(allocation.codeItemIds || '[]');
        if (ids.length === 0) {
            throw new common_1.NotFoundException({
                error: 'NO_ALLOCATION',
                code: 'EMPTY_ALLOCATION',
                message: 'No codes allocated to this fulfillment',
            });
        }
        const codeItems = await this.prisma.codeItem.findMany({
            where: { id: { in: ids } },
            include: { denomination: true },
        });
        if (codeItems.length !== ids.length) {
            this.logger.error(`[DELIVERY] Allocation ${allocation.id} references ${ids.length} code item(s) but only ${codeItems.length} were found in the database. fulfillmentId=${deliveryToken.fulfillmentId}`);
            throw new common_1.NotFoundException({
                error: 'ALLOCATION_CORRUPT',
                code: 'MISSING_CODE_ITEMS',
                message: 'Some allocated codes could not be found. Please contact support.',
            });
        }
        const codes = [];
        const decryptFailures = [];
        for (const item of codeItems) {
            try {
                const plaintext = this.encryptionService.decrypt(item.encryptedCode);
                if (!plaintext || plaintext.trim().length === 0) {
                    decryptFailures.push(item.id);
                    continue;
                }
                codes.push({
                    denomination: `$${item.denomination?.faceValue ?? '??'}`,
                    code: plaintext,
                });
            }
            catch (err) {
                this.logger.error(`[DELIVERY] Failed to decrypt code item ${item.id} for fulfillment ${deliveryToken.fulfillmentId}: ${err.message}`);
                decryptFailures.push(item.id);
            }
        }
        if (decryptFailures.length > 0 || codes.length !== ids.length) {
            this.logger.error(`[DELIVERY] CRITICAL: ${decryptFailures.length}/${ids.length} code(s) failed to decrypt for fulfillment ${deliveryToken.fulfillmentId}. Refusing to reveal a partial/empty result.`);
            throw new common_1.NotFoundException({
                error: 'DECRYPTION_FAILED',
                code: 'CODE_DECRYPT_FAILED',
                message: 'Unable to retrieve one or more of your codes right now. Please contact support — your codes have NOT been lost.',
            });
        }
        const isFirstReveal = !deliveryToken.revealedAt;
        if (isFirstReveal) {
            await this.prisma.$transaction(async (tx) => {
                await tx.codeItem.updateMany({
                    where: { id: { in: ids } },
                    data: {
                        status: 'DELIVERED',
                        revealedAt: new Date(),
                        revealedIp: ip,
                    },
                });
                await tx.deliveryToken.update({
                    where: { id: deliveryToken.id },
                    data: {
                        revealedAt: new Date(),
                        revealedIp: ip,
                    },
                });
                await tx.fulfillmentRequest.update({
                    where: { id: deliveryToken.fulfillmentId },
                    data: { status: 'DELIVERED' },
                });
            });
        }
        await this.auditService.log({
            actorType: 'CUSTOMER',
            action: 'delivery.revealed',
            entity: 'DeliveryToken',
            entityId: deliveryToken.id,
            metadata: {
                fulfillmentId: deliveryToken.fulfillmentId,
                product: deliveryToken.fulfillment.product.name,
                codeCount: codes.length,
                isFirstReveal,
            },
            ip,
        });
        if (isFirstReveal) {
            this.webhookService.queueWebhookEvent(deliveryToken.fulfillment.merchantId, 'delivery.revealed', {
                fulfillment_id: deliveryToken.fulfillmentId,
                reference_id: deliveryToken.fulfillment.referenceId,
                revealed_at: new Date().toISOString(),
            }).catch(() => { });
        }
        return {
            already_revealed: !isFirstReveal,
            revealed_at: deliveryToken.revealedAt || new Date().toISOString(),
            product_name: deliveryToken.fulfillment.product.name,
            reference_id: deliveryToken.fulfillment.referenceId,
            customer_email: deliveryToken.fulfillment.customerEmail,
            customer_name: deliveryToken.fulfillment.customerName,
            codes,
        };
    }
    async regenerateDeliveryLink(fulfillmentId, actorId) {
        const fulfillment = await this.prisma.fulfillmentRequest.findUnique({
            where: { id: fulfillmentId },
            include: { allocations: true },
        });
        if (!fulfillment)
            throw new common_1.NotFoundException('Fulfillment not found');
        if (!['ALLOCATED', 'DELIVERED'].includes(fulfillment.status)) {
            throw new common_1.NotFoundException('Fulfillment has not been allocated yet');
        }
        const rawToken = this.encryptionService.generateToken(32);
        const tokenHash = this.encryptionService.hashToken(rawToken);
        await this.prisma.deliveryToken.upsert({
            where: { fulfillmentId },
            create: { fulfillmentId, tokenHash },
            update: { tokenHash, revealedAt: null, revealedIp: null },
        });
        if (actorId) {
            await this.auditService.log({
                actorType: 'ADMIN',
                actorId,
                action: 'delivery.link.regenerated',
                entity: 'FulfillmentRequest',
                entityId: fulfillmentId,
            }).catch(() => { });
        }
        const baseUrl = (this.configService.get('APP_URL', 'http://localhost:3000') || '').replace(/\/+$/, '');
        return {
            fulfillment_id: fulfillmentId,
            delivery_link: `${baseUrl}/api/v1/reveal/${rawToken}`,
            portal_link: `${baseUrl}/d/${rawToken}`,
        };
    }
};
exports.DeliveryService = DeliveryService;
exports.DeliveryService = DeliveryService = DeliveryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        encryption_service_1.EncryptionService,
        audit_service_1.AuditService,
        webhook_service_1.WebhookService,
        email_service_1.EmailService,
        config_1.ConfigService])
], DeliveryService);
//# sourceMappingURL=delivery.service.js.map