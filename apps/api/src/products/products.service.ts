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
    return this.prisma.product.findMany({
      include: { supplier: true, denominations: true },
      orderBy: { name: 'asc' },
    });
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

  async createProduct(data: { name: string; region: string; supplierId?: string }) {
    return this.prisma.product.create({
      data: {
        name: data.name,
        region: data.region,
        supplierId: data.supplierId,
      },
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
