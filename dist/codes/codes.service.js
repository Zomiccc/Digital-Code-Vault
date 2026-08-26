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
var CodesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const encryption_service_1 = require("../encryption/encryption.service");
const audit_service_1 = require("../audit/audit.service");
const fulfillment_service_1 = require("../fulfillment/fulfillment.service");
const nanoid_1 = require("nanoid");
let CodesService = CodesService_1 = class CodesService {
    prisma;
    encryptionService;
    auditService;
    fulfillmentService;
    logger = new common_1.Logger(CodesService_1.name);
    constructor(prisma, encryptionService, auditService, fulfillmentService) {
        this.prisma = prisma;
        this.encryptionService = encryptionService;
        this.auditService = auditService;
        this.fulfillmentService = fulfillmentService;
    }
    async bulkUpload(denominationId, codes, adminId, supplierId, ip, costInfo) {
        const denomination = await this.prisma.denomination.findUnique({
            where: { id: denominationId },
        });
        if (!denomination) {
            throw new common_1.NotFoundException('Denomination not found');
        }
        const batchId = (0, nanoid_1.nanoid)(16);
        const results = {
            inserted: 0,
            duplicates: 0,
            errors: [],
        };
        const existingHashes = new Set();
        const existingItems = await this.prisma.codeItem.findMany({
            where: { denominationId },
            select: { codeHash: true },
        });
        for (const item of existingItems) {
            existingHashes.add(item.codeHash);
        }
        for (let i = 0; i < codes.length; i++) {
            const code = codes[i].trim();
            if (!code) {
                results.errors.push(`Row ${i + 1}: empty code`);
                continue;
            }
            const codeHash = this.encryptionService.hashCode(code);
            if (existingHashes.has(codeHash)) {
                results.duplicates++;
                continue;
            }
            existingHashes.add(codeHash);
            const encryptedCode = this.encryptionService.encrypt(code);
            try {
                await this.prisma.codeItem.create({
                    data: {
                        denominationId,
                        encryptedCode,
                        codeHash,
                        status: 'AVAILABLE',
                        batchId,
                        supplierId,
                    },
                });
                results.inserted++;
            }
            catch (err) {
                results.errors.push(`Row ${i + 1}: ${err.message}`);
            }
        }
        await this.auditService.log({
            actorType: 'ADMIN',
            actorId: adminId,
            action: 'codes.bulk_upload',
            entity: 'Denomination',
            entityId: denominationId,
            metadata: {
                batchId,
                total: codes.length,
                inserted: results.inserted,
                duplicates: results.duplicates,
                errors: results.errors.length,
                supplierId: supplierId || null,
                costPerCode: costInfo?.costPerCode ?? null,
                currency: costInfo?.currency ?? null,
            },
            ip,
        });
        await this.prisma.codeBatch.create({
            data: {
                id: batchId,
                denominationId,
                quantity: codes.length,
                supplierId: supplierId || null,
                costPerCode: costInfo?.costPerCode ?? null,
                currency: costInfo?.currency || 'USD',
                note: costInfo?.note || null,
                createdBy: adminId,
            },
        }).catch(() => { });
        this.logger.log(`Bulk upload: ${results.inserted} inserted, ${results.duplicates} duplicates, ${results.errors.length} errors (batch ${batchId})`);
        if (results.inserted > 0) {
            const denomination = await this.prisma.denomination.findUnique({
                where: { id: denominationId },
                select: { productId: true },
            });
            if (denomination) {
                this.fulfillmentService.fulfillPendingSupplierRequests(denomination.productId).catch((err) => {
                    this.logger.error(`Auto-fulfill failed: ${err.message}`);
                });
            }
        }
        return { batchId, ...results };
    }
    async listCodes(options) {
        const where = {};
        if (options.denominationId)
            where.denominationId = options.denominationId;
        if (options.status)
            where.status = options.status;
        if (options.batchId)
            where.batchId = options.batchId;
        const [items, total] = await Promise.all([
            this.prisma.codeItem.findMany({
                where,
                include: {
                    denomination: {
                        include: { product: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: options.limit || 50,
                skip: options.offset || 0,
            }),
            this.prisma.codeItem.count({ where }),
        ]);
        return {
            items: items.map((item) => ({
                id: item.id,
                denomination: {
                    id: item.denomination.id,
                    face_value: item.denomination.faceValue,
                    product: item.denomination.product.name,
                    region: item.denomination.product.region,
                },
                status: item.status,
                batch_id: item.batchId,
                reserved_until: item.reservedUntil,
                revealed_at: item.revealedAt,
                created_at: item.createdAt,
                masked_code: '****',
            })),
            total,
        };
    }
    async revealCode(codeItemId, adminId, ip) {
        const item = await this.prisma.codeItem.findUnique({
            where: { id: codeItemId },
            include: { denomination: { include: { product: true } } },
        });
        if (!item) {
            throw new common_1.NotFoundException('Code item not found');
        }
        if (item.status === 'DELIVERED') {
            throw new common_1.BadRequestException('Code has already been revealed');
        }
        if (item.status === 'VOIDED') {
            throw new common_1.BadRequestException('Code has been voided and cannot be revealed');
        }
        const plaintext = this.encryptionService.decrypt(item.encryptedCode);
        await this.prisma.codeItem.update({
            where: { id: codeItemId },
            data: {
                status: 'DELIVERED',
                revealedAt: new Date(),
                revealedIp: ip || null,
                reservedUntil: null,
                reservedByReqId: null,
            },
        });
        await this.auditService.log({
            actorType: 'ADMIN',
            actorId: adminId,
            action: 'codes.reveal',
            entity: 'CodeItem',
            entityId: codeItemId,
            metadata: {
                denomination: item.denomination.faceValue,
                product: item.denomination.product.name,
            },
            ip,
        });
        return {
            id: item.id,
            code: plaintext,
            masked: this.encryptionService.maskCode(plaintext),
            denomination: item.denomination.faceValue,
            product: item.denomination.product.name,
            status: 'DELIVERED',
        };
    }
    async voidCode(codeItemId, adminId, ip) {
        const item = await this.prisma.codeItem.findUnique({ where: { id: codeItemId } });
        if (!item)
            throw new common_1.NotFoundException('Code item not found');
        if (item.status === 'DELIVERED') {
            throw new common_1.BadRequestException('Cannot void a delivered code');
        }
        await this.prisma.codeItem.update({
            where: { id: codeItemId },
            data: { status: 'VOIDED', reservedUntil: null, reservedByReqId: null },
        });
        await this.auditService.log({
            actorType: 'ADMIN',
            actorId: adminId,
            action: 'codes.void',
            entity: 'CodeItem',
            entityId: codeItemId,
            ip,
        });
        return { success: true };
    }
    async getInventoryStats() {
        const stats = await this.prisma.codeItem.groupBy({
            by: ['status'],
            _count: true,
        });
        const result = {};
        for (const s of stats) {
            result[s.status] = s._count;
        }
        return result;
    }
    async merchantBulkUpload(denominationId, codes, merchantId, ip) {
        const denomination = await this.prisma.denomination.findUnique({
            where: { id: denominationId },
            include: { product: true },
        });
        if (!denomination) {
            throw new common_1.NotFoundException('Denomination not found');
        }
        const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant) {
            throw new common_1.NotFoundException('Merchant not found');
        }
        const allowedIds = JSON.parse(merchant.allowedProductIds || '[]');
        if (allowedIds.length > 0 && !allowedIds.includes(denomination.productId)) {
            throw new common_1.ForbiddenException('Merchant is not allowed to upload codes for this product');
        }
        const batchId = (0, nanoid_1.nanoid)(16);
        const results = {
            inserted: 0,
            duplicates: 0,
            errors: [],
        };
        const existingHashes = new Set();
        const existingItems = await this.prisma.codeItem.findMany({
            where: { denominationId },
            select: { codeHash: true },
        });
        for (const item of existingItems) {
            existingHashes.add(item.codeHash);
        }
        for (let i = 0; i < codes.length; i++) {
            const code = codes[i].trim();
            if (!code) {
                results.errors.push(`Row ${i + 1}: empty code`);
                continue;
            }
            const codeHash = this.encryptionService.hashCode(code);
            if (existingHashes.has(codeHash)) {
                results.duplicates++;
                continue;
            }
            existingHashes.add(codeHash);
            const encryptedCode = this.encryptionService.encrypt(code);
            try {
                await this.prisma.codeItem.create({
                    data: {
                        denominationId,
                        encryptedCode,
                        codeHash,
                        status: 'AVAILABLE',
                        batchId,
                        merchantId,
                        source: 'MERCHANT',
                    },
                });
                results.inserted++;
            }
            catch (err) {
                results.errors.push(`Row ${i + 1}: ${err.message}`);
            }
        }
        await this.auditService.log({
            actorType: 'MERCHANT',
            actorId: merchantId,
            action: 'codes.merchant_upload',
            entity: 'Denomination',
            entityId: denominationId,
            metadata: {
                batchId,
                total: codes.length,
                inserted: results.inserted,
                duplicates: results.duplicates,
                errors: results.errors.length,
                productName: denomination.product.name,
                faceValue: denomination.faceValue,
            },
            ip,
        });
        this.logger.log(`Merchant ${merchantId} bulk upload: ${results.inserted} inserted, ${results.duplicates} duplicates, ${results.errors.length} errors (batch ${batchId})`);
        return { batchId, ...results };
    }
    async listMerchantCodes(merchantId, options) {
        const where = { merchantId };
        if (options.denominationId)
            where.denominationId = options.denominationId;
        if (options.status)
            where.status = options.status;
        const [items, total] = await Promise.all([
            this.prisma.codeItem.findMany({
                where,
                include: {
                    denomination: {
                        include: { product: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: options.limit || 50,
                skip: options.offset || 0,
            }),
            this.prisma.codeItem.count({ where }),
        ]);
        return {
            items: items.map((item) => ({
                id: item.id,
                denomination: {
                    id: item.denomination.id,
                    face_value: item.denomination.faceValue,
                    product: item.denomination.product.name,
                    region: item.denomination.product.region,
                },
                status: item.status,
                source: item.source,
                batch_id: item.batchId,
                reserved_until: item.reservedUntil,
                revealed_at: item.revealedAt,
                created_at: item.createdAt,
                masked_code: '****',
            })),
            total,
        };
    }
    async getMerchantInventoryStats(merchantId) {
        const stats = await this.prisma.codeItem.groupBy({
            by: ['status', 'source'],
            where: { merchantId },
            _count: true,
        });
        const result = {};
        for (const s of stats) {
            if (!result[s.source])
                result[s.source] = {};
            result[s.source][s.status] = s._count;
        }
        return result;
    }
    async voidMerchantCode(codeItemId, merchantId, ip) {
        const item = await this.prisma.codeItem.findUnique({ where: { id: codeItemId } });
        if (!item)
            throw new common_1.NotFoundException('Code item not found');
        if (item.merchantId !== merchantId) {
            throw new common_1.ForbiddenException('You do not own this code');
        }
        if (item.status === 'DELIVERED') {
            throw new common_1.BadRequestException('Cannot void a delivered code');
        }
        await this.prisma.codeItem.update({
            where: { id: codeItemId },
            data: { status: 'VOIDED', reservedUntil: null, reservedByReqId: null },
        });
        await this.auditService.log({
            actorType: 'MERCHANT',
            actorId: merchantId,
            action: 'codes.merchant_void',
            entity: 'CodeItem',
            entityId: codeItemId,
            ip,
        });
        return { success: true };
    }
};
exports.CodesService = CodesService;
exports.CodesService = CodesService = CodesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        encryption_service_1.EncryptionService,
        audit_service_1.AuditService,
        fulfillment_service_1.FulfillmentService])
], CodesService);
//# sourceMappingURL=codes.service.js.map