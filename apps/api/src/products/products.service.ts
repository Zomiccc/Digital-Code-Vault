import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async listProductsForMerchant(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return [];

    const where: Record<string, unknown> = { status: 'ACTIVE' };
    const allowedIds: string[] = JSON.parse(merchant.allowedProductIds || '[]');
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

    // Attach available inventory count per denomination (avoids N+1 by batching one query per product's denomination set)
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
      denominations: p.denominations.map((d: any) => ({
        ...d,
        availableCount: countMap.get(d.id) || 0,
      })),
    }));
  }

  async getProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { supplier: true, denominations: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async getDenominations(productId: string) {
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

  async createProduct(data: { name: string; region: string; supplierId?: string; productType?: string; categoryId?: string }) {
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

  async updateProductCategory(productId: string, categoryId: string | null) {
    if (categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Category not found');
    }
    return this.prisma.product.update({
      where: { id: productId },
      data: { categoryId },
    });
  }

  async updateProductType(productId: string, productType: string) {
    if (!['NORMAL', 'ESSENTIALS'].includes(productType)) {
      throw new Error('Invalid productType. Must be NORMAL or ESSENTIALS.');
    }
    return this.prisma.product.update({
      where: { id: productId },
      data: { productType },
    });
  }

  async createDenomination(productId: string, faceValue: number, currency: string = 'USD') {
    return this.prisma.denomination.create({
      data: {
        productId,
        faceValue: faceValue,
        currency,
      },
    });
  }
}
