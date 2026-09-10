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
   * Each product carries the currency its region reads in, and each face value
   * is reported in the currency it is stored in. Nothing is converted - there
   * are no exchange rates, only the prices an admin sets per currency.
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
          ...localPrice(Number(denomination.faceValue), denomination.currency, display),
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
      ...localPrice(Number(d.faceValue), d.currency, display),
    }));
  }

  /**
   * Delete a code value, but only while nothing has ever been stored in it.
   *
   * CodeItem cascades from Denomination, so an unguarded delete would take
   * every code with it — including sold and delivered ones, and with them the
   * record of what a customer was given. A value holding codes is therefore
   * refused, naming what is in the way, and the codes have to be dealt with
   * first.
   */
  async deleteDenomination(denominationId: string, adminId?: string, ip?: string) {
    const denomination = await this.prisma.denomination.findUnique({
      where: { id: denominationId },
      include: { product: { select: { name: true } } },
    });
    if (!denomination) throw new NotFoundException('Denomination not found');

    const [codes, ruleItems] = await Promise.all([
      this.prisma.codeItem.count({ where: { denominationId } }),
      this.prisma.fulfillmentCombinationItem.count({ where: { denominationId } }),
    ]);

    if (codes > 0) {
      throw new BadRequestException(
        `This value still holds ${codes} code(s). Remove or use them up before deleting it, ` +
        `otherwise their history goes with it.`,
      );
    }
    if (ruleItems > 0) {
      throw new BadRequestException(
        `${ruleItems} delivery rule(s) hand out this value. Change those rules first, ` +
        `or they would silently stop working.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Prices are addressed by id rather than by a foreign key, so nothing
      // cleans them up on their own; a later value reusing the id would
      // inherit them.
      await tx.sellingPrice.deleteMany({
        where: { itemType: 'DENOMINATION', itemId: denominationId },
      });
      await tx.denomination.delete({ where: { id: denominationId } });
    });

    if (adminId) {
      await this.auditService.log({
        actorType: 'ADMIN', actorId: adminId, action: 'denomination.delete',
        entity: 'Denomination', entityId: denominationId,
        metadata: {
          product: denomination.product?.name,
          faceValue: Number(denomination.faceValue),
          currency: denomination.currency,
        },
        ip,
      });
    }
    return { id: denominationId, deleted: true };
  }

  /**
   * Delete a product, but only while it has no history worth keeping.
   *
   * Denominations, regions and packs cascade from a product, and codes cascade
   * from those, so this is a wide delete. An order that ever referenced the
   * product blocks it outright — the database would refuse anyway, with a
   * foreign-key error nobody can read — and so does any stored code.
   */
  async deleteProduct(productId: string, adminId?: string, ip?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, region: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const [orders, codes, connected] = await Promise.all([
      this.prisma.fulfillmentRequest.count({ where: { productId } }),
      this.prisma.codeItem.count({ where: { denomination: { productId } } }),
      this.prisma.connectedProduct.count({ where: { dcvProductId: productId } }),
    ]);

    if (orders > 0) {
      throw new BadRequestException(
        `${product.name} has ${orders} order(s) against it and cannot be deleted — that would ` +
        `erase the record of what was delivered. Deactivate it instead to take it off sale.`,
      );
    }
    if (codes > 0) {
      throw new BadRequestException(
        `${product.name} still holds ${codes} code(s) across its values. Remove those first.`,
      );
    }
    if (connected > 0) {
      throw new BadRequestException(
        `${product.name} is linked to ${connected} storefront product. Unlink it first, ` +
        `or those orders would stop resolving.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const denominations = await tx.denomination.findMany({
        where: { productId }, select: { id: true },
      });
      const variants = await tx.variant.findMany({
        where: { productRegion: { productId } }, select: { id: true },
      });
      const pricedIds = [...denominations.map((d) => d.id), ...variants.map((v) => v.id)];
      if (pricedIds.length) {
        await tx.sellingPrice.deleteMany({ where: { itemId: { in: pricedIds } } });
      }
      // Denominations, product-regions and their variants all cascade.
      await tx.product.delete({ where: { id: productId } });
    });

    if (adminId) {
      await this.auditService.log({
        actorType: 'ADMIN', actorId: adminId, action: 'product.delete',
        entity: 'Product', entityId: productId,
        metadata: { name: product.name, region: product.region },
        ip,
      });
    }
    return { id: productId, deleted: true };
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

  /**
   * Create a product.
   *
   * A subcategory may stand in for the region and the category: filing a
   * product under "Xbox USA" is enough to know it belongs to Xbox Digital
   * Codes and sells in USA, so neither has to be typed again. An explicit
   * region still wins, and a product created without a subcategory behaves
   * exactly as it always did.
   */
  async createProduct(data: {
    name: string; region?: string; supplierId?: string;
    categoryId?: string; subcategoryId?: string; sku?: string;
  }) {
    const subcategory = data.subcategoryId
      ? await this.prisma.subcategory.findUnique({
          where: { id: data.subcategoryId },
          include: { region: true },
        })
      : null;
    if (data.subcategoryId && !subcategory) {
      throw new NotFoundException('Subcategory not found');
    }

    // The subcategory answers both of these when it can, so filing a product
    // under "Xbox USA" is enough — the region is not typed again, and mistyping
    // it was how a product ended up in a region of its own.
    const region = (data.region || subcategory?.region?.code || '').trim();
    if (!region) {
      throw new BadRequestException(
        'A product needs a region — either give one, or file it under a subcategory that has one',
      );
    }
    const categoryId = data.categoryId || subcategory?.categoryId || null;

    // Every product gets a SKU, because it is what matches incoming storefront
    // orders to this product. An explicit one is respected; otherwise one is
    // generated, and either way a collision is resolved rather than rejected.
    const taken = await this.prisma.product.findMany({
      where: { sku: { not: null } },
      select: { sku: true },
    });
    const base = data.sku?.trim() || resolveProductSkuBase(data.name, region);
    const sku = uniqueSku(base, taken.map((p) => p.sku!));

    const product = await this.prisma.product.create({
      data: {
        name: data.name,
        region,
        supplierId: data.supplierId,
        categoryId,
        subcategoryId: subcategory?.id || null,
        sku,
      },
    });

    // Packs hang off a product-region, so a product whose subcategory names a
    // region gets that link straight away. Without it the product exists but
    // has nowhere to put a pack, which is a dead end nobody expects.
    if (subcategory?.regionId) {
      await this.prisma.productRegion
        .create({ data: { productId: product.id, regionId: subcategory.regionId } })
        .catch(() => undefined);
    }

    return product;
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
