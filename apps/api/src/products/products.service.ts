import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyService, localPrice } from '../currency/currency.service';
import { resolveProductSkuBase, uniqueSku, normaliseSku } from './sku';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private currencyService: CurrencyService,
    private auditService: AuditService,
  ) {}

  async listProductsForMerchant(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return [];

    const where: Record<string, unknown> = { status: 'ACTIVE' };
    const allowedIds: string[] = JSON.parse(merchant.allowedProductIds || '[]');
    if (allowedIds.length > 0) {
      where.id = { in: allowedIds };
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        supplier: true,
        denominations: {
          orderBy: { faceValue: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return this.withRegionalPrices(products);
  }

  /**
   * Face values are stored in USD. Each product also carries the price in its own
   * region's currency, so a Turkish product reads in Lira and a Pakistani one in
   * rupees without the caller needing to know any rates.
   */
  private async withRegionalPrices<T extends { region: string; denominations: any[] }>(products: T[]) {
    const displays = await this.currencyService.displayCurrenciesForRegions(
      products.map((product) => product.region),
    );
    return products.map((product) => {
      const display = displays.get((product.region ?? '').trim());
      return {
        ...product,
        regional_currency: display?.currency ?? 'USD',
        regional_symbol: display?.symbol ?? '$',
        denominations: product.denominations.map((denomination: any) => ({
          ...denomination,
          ...(display
            ? localPrice(Number(denomination.faceValue), display)
            : {}),
        })),
      };
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

    return this.withRegionalPrices(
      products.map((p) => ({
        ...p,
        denominations: p.denominations.map((d: any) => ({
          ...d,
          availableCount: countMap.get(d.id) || 0,
        })),
      })),
    );
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
    const [product, denominations] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: productId }, select: { region: true } }),
      this.prisma.denomination.findMany({
        where: { productId },
        include: {
          codeItems: {
            where: { status: 'AVAILABLE' },
            select: { id: true },
          },
        },
        orderBy: { faceValue: 'asc' },
      }),
    ]);

    const display = await this.currencyService.displayCurrencyForRegion(product?.region);
    return denominations.map((d) => ({
      id: d.id,
      face_value: d.faceValue,
      currency: d.currency,
      available_stock: d.codeItems.length,
      ...localPrice(Number(d.faceValue), display),
    }));
  }

  /**
   * Suggest the SKU a product would get, without creating anything. The admin UI
   * previews this while typing so the SKU is visible before the product exists.
   */
  async suggestSku(name: string, region: string) {
    const base = resolveProductSkuBase(name || '', region || '');
    const taken = await this.prisma.product.findMany({
      where: { sku: { not: null } },
      select: { sku: true },
    });
    return { sku: uniqueSku(base, taken.map((p) => p.sku!)) };
  }

  async createProduct(data: { name: string; region: string; supplierId?: string; productType?: string; categoryId?: string; sku?: string }) {
    // Every product gets a SKU, because it is what matches incoming storefront
    // orders to this product. An explicit one is respected; otherwise one is
    // generated, and either way a collision is resolved rather than rejected.
    const taken = await this.prisma.product.findMany({
      where: { sku: { not: null } },
      select: { sku: true },
    });
    const base = data.sku?.trim() || resolveProductSkuBase(data.name, data.region);
    const sku = uniqueSku(base, taken.map((p) => p.sku!));

    return this.prisma.product.create({
      data: {
        name: data.name,
        region: data.region,
        supplierId: data.supplierId,
        productType: data.productType || 'NORMAL',
        categoryId: data.categoryId || null,
        sku,
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

  async updateProductSku(productId: string, sku: string | null) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    // Incoming storefront orders are matched to a product by SKU, so two products
    // sharing one would route orders to whichever the database returned first.
    const normalised = sku?.trim() ? normaliseSku(sku) : null;
    if (normalised) {
      const clash = await this.prisma.product.findFirst({
        where: { sku: normalised, id: { not: productId } },
        select: { id: true, name: true },
      });
      if (clash) {
        throw new BadRequestException(`SKU ${normalised} is already used by "${clash.name}"`);
      }
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: { sku: normalised },
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

  /**
   * Change what a code value is worth, and in which currency.
   *
   * This is how a region gets local pricing: a Saudi $50 becomes SAR 187.50, or
   * whatever it actually sells for. It is consequential — codes already uploaded
   * against this denomination are worth the new amount from now on, and a
   * delivery rule that added up to the old value no longer will — so the change
   * is audited and a collision with another value on the same product is
   * refused rather than silently merged.
   */
  async updateDenomination(
    id: string,
    data: { faceValue?: number; currency?: string },
    adminId?: string,
    ip?: string,
  ) {
    const denomination = await this.prisma.denomination.findUnique({ where: { id } });
    if (!denomination) throw new NotFoundException('Denomination not found');

    const faceValue = data.faceValue ?? Number(denomination.faceValue);
    const currency = (data.currency ?? denomination.currency).toUpperCase();

    if (!Number.isFinite(faceValue) || faceValue <= 0) {
      throw new BadRequestException('Value must be a positive number');
    }
    if (Math.abs(faceValue * 100 - Math.round(faceValue * 100)) > 1e-7) {
      throw new BadRequestException('Value must have at most two decimal places');
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('Currency must be a three-letter code');
    }

    const clash = await this.prisma.denomination.findFirst({
      where: {
        productId: denomination.productId,
        faceValue,
        currency,
        id: { not: id },
      },
    });
    if (clash) {
      throw new BadRequestException(
        `This product already has a ${currency} ${faceValue} value`,
      );
    }

    const updated = await this.prisma.denomination.update({
      where: { id },
      data: { faceValue, currency },
    });
    if (adminId) {
      await this.auditService.log({
        actorType: 'ADMIN', actorId: adminId, action: 'denomination.update_price',
        entity: 'Denomination', entityId: id,
        metadata: {
          from: { faceValue: Number(denomination.faceValue), currency: denomination.currency },
          to: { faceValue, currency },
        },
        ip,
      });
    }
    return { id: updated.id, face_value: Number(updated.faceValue), currency: updated.currency };
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
