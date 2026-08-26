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
var EssentialsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EssentialsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
let EssentialsService = EssentialsService_1 = class EssentialsService {
    prisma;
    auditService;
    logger = new common_1.Logger(EssentialsService_1.name);
    constructor(prisma, auditService) {
        this.prisma = prisma;
        this.auditService = auditService;
    }
    async getDeliveryConfig(productId) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
            throw new common_1.NotFoundException({ error: 'NOT_FOUND', code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
        }
        const items = await this.prisma.essentialsDeliveryItem.findMany({
            where: { productId },
            include: { denomination: true },
            orderBy: { createdAt: 'asc' },
        });
        return {
            productId,
            items: items.map((i) => ({
                id: i.id,
                denominationId: i.denominationId,
                faceValue: Number(i.denomination.faceValue),
                currency: i.denomination.currency,
                quantity: i.quantity,
            })),
        };
    }
    async saveDeliveryConfig(productId, items, actorId) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
            throw new common_1.NotFoundException({ error: 'NOT_FOUND', code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
        }
        if (!items || items.length === 0) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'EMPTY_DELIVERY_CONFIG',
                message: 'An Essentials product must have at least one delivery item (denomination + quantity)',
            });
        }
        const seen = new Set();
        for (const item of items) {
            if (!item.denominationId) {
                throw new common_1.BadRequestException({ error: 'INVALID_REQUEST', code: 'MISSING_DENOMINATION', message: 'denominationId is required for every item' });
            }
            if (!Number.isInteger(item.quantity) || item.quantity < 1) {
                throw new common_1.BadRequestException({ error: 'INVALID_REQUEST', code: 'INVALID_QUANTITY', message: `Quantity for denomination ${item.denominationId} must be an integer >= 1` });
            }
            if (seen.has(item.denominationId)) {
                throw new common_1.BadRequestException({ error: 'INVALID_REQUEST', code: 'DUPLICATE_DENOMINATION', message: `Denomination ${item.denominationId} is listed more than once` });
            }
            seen.add(item.denominationId);
        }
        const denominations = await this.prisma.denomination.findMany({
            where: { id: { in: items.map((i) => i.denominationId) } },
        });
        const denomMap = new Map(denominations.map((d) => [d.id, d]));
        for (const item of items) {
            const denom = denomMap.get(item.denominationId);
            if (!denom) {
                throw new common_1.BadRequestException({ error: 'INVALID_REQUEST', code: 'DENOMINATION_NOT_FOUND', message: `Denomination ${item.denominationId} does not exist` });
            }
            if (denom.productId !== productId) {
                throw new common_1.BadRequestException({ error: 'INVALID_REQUEST', code: 'DENOMINATION_WRONG_PRODUCT', message: `Denomination ${item.denominationId} does not belong to this product` });
            }
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.essentialsDeliveryItem.deleteMany({ where: { productId } });
            await tx.essentialsDeliveryItem.createMany({
                data: items.map((i) => ({ productId, denominationId: i.denominationId, quantity: i.quantity })),
            });
        });
        if (actorId) {
            await this.auditService.log({
                actorType: 'ADMIN',
                actorId,
                action: 'essentials.delivery_config.save',
                entity: 'EssentialsDeliveryItem',
                entityId: productId,
                metadata: { productId, items },
            });
        }
        return this.getDeliveryConfig(productId);
    }
    async getAvailability(productId) {
        const config = await this.getDeliveryConfig(productId);
        if (config.items.length === 0) {
            return { productId, ready: false, reason: 'NO_DELIVERY_CONFIG', items: [] };
        }
        const results = await Promise.all(config.items.map(async (item) => {
            const availableCount = await this.prisma.codeItem.count({
                where: { denominationId: item.denominationId, status: 'AVAILABLE' },
            });
            return {
                denominationId: item.denominationId,
                faceValue: item.faceValue,
                required: item.quantity,
                available: availableCount,
                sufficient: availableCount >= item.quantity,
            };
        }));
        const ready = results.every((r) => r.sufficient);
        return { productId, ready, items: results };
    }
};
exports.EssentialsService = EssentialsService;
exports.EssentialsService = EssentialsService = EssentialsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], EssentialsService);
//# sourceMappingURL=essentials.service.js.map