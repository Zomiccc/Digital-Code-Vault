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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ProductsService = class ProductsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listProductsForMerchant(merchantId) {
        const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant)
            return [];
        const where = { status: 'ACTIVE' };
        const allowedIds = JSON.parse(merchant.allowedProductIds || '[]');
        if (allowedIds.length > 0) {
            where.id = { in: allowedIds };
        }
        return this.prisma.product.findMany({
            where,
            include: {
                supplier: true,
                denominations: {
                    orderBy: { faceValue: 'asc' },
                },
            },
            orderBy: { name: 'asc' },
        });
    }
    async listAllProducts() {
        const products = await this.prisma.product.findMany({
            include: {
                supplier: true,
                category: true,
                denominations: {
                    orderBy: { faceValue: 'asc' },
                },
            },
            orderBy: { name: 'asc' },
        });
        const allDenomIds = products.flatMap((p) => p.denominations.map((d) => d.id));
        const counts = allDenomIds.length
            ? await this.prisma.codeItem.groupBy({
                by: ['denominationId'],
                where: { denominationId: { in: allDenomIds }, status: 'AVAILABLE' },
                _count: { _all: true },
            })
            : [];
        const countMap = new Map(counts.map((c) => [c.denominationId, c._count._all]));
        return products.map((p) => ({
            ...p,
            denominations: p.denominations.map((d) => ({
                ...d,
                availableCount: countMap.get(d.id) || 0,
            })),
        }));
    }
    async getProduct(productId) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            include: { supplier: true, denominations: true },
        });
        if (!product)
            throw new common_1.NotFoundException('Product not found');
        return product;
    }
    async getDenominations(productId) {
        const denominations = await this.prisma.denomination.findMany({
            where: { productId },
            include: {
                codeItems: {
                    where: { status: 'AVAILABLE' },
                    select: { id: true },
                },
            },
            orderBy: { faceValue: 'asc' },
        });
        return denominations.map((d) => ({
            id: d.id,
            face_value: d.faceValue,
            currency: d.currency,
            available_stock: d.codeItems.length,
        }));
    }
    async createProduct(data) {
        return this.prisma.product.create({
            data: {
                name: data.name,
                region: data.region,
                supplierId: data.supplierId,
                productType: data.productType || 'NORMAL',
                categoryId: data.categoryId || null,
            },
        });
    }
    async updateProductCategory(productId, categoryId) {
        if (categoryId) {
            const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
            if (!category)
                throw new common_1.NotFoundException('Category not found');
        }
        return this.prisma.product.update({
            where: { id: productId },
            data: { categoryId },
        });
    }
    async updateProductType(productId, productType) {
        if (!['NORMAL', 'ESSENTIALS'].includes(productType)) {
            throw new Error('Invalid productType. Must be NORMAL or ESSENTIALS.');
        }
        return this.prisma.product.update({
            where: { id: productId },
            data: { productType },
        });
    }
    async createDenomination(productId, faceValue, currency = 'USD') {
        return this.prisma.denomination.create({
            data: {
                productId,
                faceValue: faceValue,
                currency,
            },
        });
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductsService);
//# sourceMappingURL=products.service.js.map