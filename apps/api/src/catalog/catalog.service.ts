import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ─── Categories ───

  async listCategories(activeOnly = false) {
    return this.prisma.category.findMany({
      where: activeOnly ? { active: true } : undefined,
      include: { _count: { select: { products: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getCategory(id: string) {
    const cat = await this.prisma.category.findUnique({
      where: { id },
      include: { products: { orderBy: { name: 'asc' } } },
    });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async createCategory(data: { name: string; slug?: string; description?: string; image?: string; sortOrder?: number }, actorId?: string) {
    const slug = data.slug || slugify(data.name);
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) throw new BadRequestException('Slug already exists');

    const cat = await this.prisma.category.create({
      data: { name: data.name, slug, description: data.description, image: data.image, sortOrder: data.sortOrder || 0 },
    });

    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'category.create', entity: 'Category', entityId: cat.id, metadata: { name: cat.name } });
    }
    return cat;
  }

  async updateCategory(id: string, data: any, actorId?: string) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.image !== undefined) updateData.image = data.image;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.active !== undefined) updateData.active = data.active;

    const updated = await this.prisma.category.update({ where: { id }, data: updateData });
    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'category.update', entity: 'Category', entityId: id, metadata: updateData });
    }
    return updated;
  }

  async deleteCategory(id: string, actorId?: string) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');

    await this.prisma.category.update({ where: { id }, data: { active: false } });
    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'category.deactivate', entity: 'Category', entityId: id });
    }
    return { id, deactivated: true };
  }

  // ─── Regions ───

  async listRegions(activeOnly = false) {
    return this.prisma.region.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async createRegion(data: { name: string; code: string; currency?: string; symbol?: string }, actorId?: string) {
    const existing = await this.prisma.region.findUnique({ where: { code: data.code } });
    if (existing) throw new BadRequestException('Region code already exists');

    const region = await this.prisma.region.create({
      data: { name: data.name, code: data.code, currency: data.currency || 'USD', symbol: data.symbol || '$' },
    });
    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'region.create', entity: 'Region', entityId: region.id, metadata: { name: region.name, code: region.code } });
    }
    return region;
  }

  async updateRegion(id: string, data: any, actorId?: string) {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException('Region not found');

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.code !== undefined) updateData.code = data.code;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.symbol !== undefined) updateData.symbol = data.symbol;
    if (data.active !== undefined) updateData.active = data.active;

    const updated = await this.prisma.region.update({ where: { id }, data: updateData });
    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'region.update', entity: 'Region', entityId: id, metadata: updateData });
    }
    return updated;
  }

  async deleteRegion(id: string, actorId?: string) {
    await this.prisma.region.update({ where: { id }, data: { active: false } });
    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'region.deactivate', entity: 'Region', entityId: id });
    }
    return { id, deactivated: true };
  }

  // ─── Product Regions ───

  async listProductRegions(productId?: string) {
    return this.prisma.productRegion.findMany({
      where: productId ? { productId } : undefined,
      include: { product: true, region: true, variants: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createProductRegion(data: { productId: string; regionId: string }, actorId?: string) {
    const existing = await this.prisma.productRegion.findUnique({
      where: { productId_regionId: { productId: data.productId, regionId: data.regionId } },
    });
    if (existing) throw new BadRequestException('Product-Region mapping already exists');

    const pr = await this.prisma.productRegion.create({
      data: { productId: data.productId, regionId: data.regionId },
      include: { product: true, region: true },
    });
    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'productRegion.create', entity: 'ProductRegion', entityId: pr.id, metadata: { productId: data.productId, regionId: data.regionId } });
    }
    return pr;
  }

  async deleteProductRegion(id: string, actorId?: string) {
    await this.prisma.productRegion.delete({ where: { id } });
    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'productRegion.delete', entity: 'ProductRegion', entityId: id });
    }
    return { id, deleted: true };
  }

  // ─── Variants ───

  async listVariants(productRegionId?: string) {
    return this.prisma.variant.findMany({
      where: productRegionId ? { productRegionId } : undefined,
      include: {
        productRegion: { include: { product: true, region: true } },
        combinations: { include: { items: { include: { denomination: true } } }, orderBy: { priority: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async listVariantsByProduct(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    // Find all ProductRegions for this product
    const productRegions = await this.prisma.productRegion.findMany({
      where: { productId },
      include: { region: true },
    });

    // Get all variants across all product-regions for this product
    const productRegionIds = productRegions.map((pr) => pr.id);
    if (productRegionIds.length === 0) return [];

    return this.prisma.variant.findMany({
      where: { productRegionId: { in: productRegionIds } },
      include: {
        productRegion: { include: { product: true, region: true } },
        combinations: { include: { items: { include: { denomination: true } } }, orderBy: { priority: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createVariantForProduct(productId: string, data: { name: string; customerPrice: number; description?: string; currency?: string }, actorId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    // Auto-resolve or create a ProductRegion for this product
    // Try to find a Region matching the product's region field
    let region = await this.prisma.region.findFirst({ where: { code: product.region } });
    if (!region) {
      // Create a default region matching the product's region string
      region = await this.prisma.region.create({
        data: { name: product.region, code: product.region, currency: 'USD', symbol: '$' },
      });
    }

    // Find or create ProductRegion
    let productRegion = await this.prisma.productRegion.findUnique({
      where: { productId_regionId: { productId, regionId: region.id } },
    });
    if (!productRegion) {
      productRegion = await this.prisma.productRegion.create({
        data: { productId, regionId: region.id },
      });
    }

    const slug = slugify(data.name);
    const existing = await this.prisma.variant.findUnique({
      where: { productRegionId_slug: { productRegionId: productRegion.id, slug } },
    });
    if (existing) throw new BadRequestException('A variant with this name already exists for this product');

    const variant = await this.prisma.variant.create({
      data: {
        productRegionId: productRegion.id,
        name: data.name,
        slug,
        description: data.description,
        customerPrice: data.customerPrice,
        currency: data.currency || 'USD',
      },
      include: { productRegion: { include: { product: true, region: true } } },
    });

    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'variant.create', entity: 'Variant', entityId: variant.id, metadata: { name: variant.name, price: data.customerPrice, productId } });
    }
    return variant;
  }

  async createVariant(data: { productRegionId: string; name: string; slug?: string; description?: string; customerPrice: number; currency?: string; sortOrder?: number }, actorId?: string) {
    const slug = data.slug || slugify(data.name);
    const existing = await this.prisma.variant.findUnique({
      where: { productRegionId_slug: { productRegionId: data.productRegionId, slug } },
    });
    if (existing) throw new BadRequestException('Variant slug already exists for this product-region');

    const variant = await this.prisma.variant.create({
      data: {
        productRegionId: data.productRegionId,
        name: data.name,
        slug,
        description: data.description,
        customerPrice: data.customerPrice,
        currency: data.currency || 'USD',
        sortOrder: data.sortOrder || 0,
      },
      include: { productRegion: { include: { product: true, region: true } } },
    });
    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'variant.create', entity: 'Variant', entityId: variant.id, metadata: { name: variant.name, price: data.customerPrice } });
    }
    return variant;
  }

  async updateVariant(id: string, data: any, actorId?: string) {
    const variant = await this.prisma.variant.findUnique({ where: { id } });
    if (!variant) throw new NotFoundException('Variant not found');

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.customerPrice !== undefined) updateData.customerPrice = data.customerPrice;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.active !== undefined) updateData.active = data.active;

    const updated = await this.prisma.variant.update({ where: { id }, data: updateData });
    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'variant.update', entity: 'Variant', entityId: id, metadata: updateData });
    }
    return updated;
  }

  async deleteVariant(id: string, actorId?: string) {
    await this.prisma.variant.update({ where: { id }, data: { active: false } });
    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'variant.deactivate', entity: 'Variant', entityId: id });
    }
    return { id, deactivated: true };
  }

  // ─── Fulfillment Combinations ───

  async listCombinations(variantId?: string, activeOnly = false) {
    const where: any = {};
    if (variantId) where.variantId = variantId;
    if (activeOnly) where.active = true;

    const combos = await this.prisma.fulfillmentCombination.findMany({
      where,
      include: {
        items: { include: { denomination: true } },
        variant: { include: { productRegion: { include: { product: true, region: true } } } },
      },
      orderBy: { priority: 'asc' },
    });

    // Enrich with inventory availability
    const enriched = await Promise.all(combos.map(async (c) => {
      const fulfillable = await this.isCombinationFulfillable(c);
      const totalValue = c.items.reduce((sum, item) => sum + Number(item.denomination.faceValue) * item.quantity, 0);
      return { ...c, fulfillable, totalValue };
    }));

    return enriched;
  }

  async createCombination(data: { variantId: string; name: string; priority?: number; active?: boolean; items: { denominationId: string; quantity: number }[] }, actorId?: string) {
    if (!data.items || data.items.length === 0) {
      throw new BadRequestException('Combination must have at least one item');
    }

    // Validate combination total equals the variant's customer price
    const variant = await this.prisma.variant.findUnique({ where: { id: data.variantId } });
    if (!variant) throw new NotFoundException('Variant not found');

    const denomIds = data.items.map((i) => i.denominationId);
    const denoms = await this.prisma.denomination.findMany({ where: { id: { in: denomIds } } });
    const denomMap = new Map(denoms.map((d) => [d.id, Number(d.faceValue)]));

    const comboTotal = data.items.reduce((sum, item) => {
      const faceValue = denomMap.get(item.denominationId);
      if (faceValue === undefined) throw new BadRequestException(`Denomination ${item.denominationId} not found`);
      return sum + faceValue * item.quantity;
    }, 0);

    // NOTE: No strict equality check between combo total and the variant's customer
    // price. Variants can be priced in a different currency (e.g. PKR storefront price)
    // than their code denominations (e.g. USD gift cards), and subscription-style
    // variants are priced independently of code face values. The admin decides the
    // mapping freely; totals are surfaced via `totalValue` for review.

    const combo = await this.prisma.fulfillmentCombination.create({
      data: {
        variantId: data.variantId,
        name: data.name,
        priority: data.priority || 1,
        active: data.active !== false,
        items: {
          create: data.items.map((item) => ({
            denominationId: item.denominationId,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: { include: { denomination: true } } },
    });

    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'combination.create', entity: 'FulfillmentCombination', entityId: combo.id, metadata: { name: combo.name, variantId: data.variantId, items: data.items } });
    }
    return combo;
  }

  async updateCombination(id: string, data: { name?: string; priority?: number; active?: boolean; items?: { denominationId: string; quantity: number }[] }, actorId?: string) {
    const combo = await this.prisma.fulfillmentCombination.findUnique({ where: { id } });
    if (!combo) throw new NotFoundException('Combination not found');

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.active !== undefined) updateData.active = data.active;

    // If items are provided, replace all items
    if (data.items !== undefined) {
      await this.prisma.fulfillmentCombinationItem.deleteMany({ where: { combinationId: id } });
      if (data.items.length > 0) {
        updateData.items = {
          create: data.items.map((item) => ({
            denominationId: item.denominationId,
            quantity: item.quantity,
          })),
        };
      }
    }

    const updated = await this.prisma.fulfillmentCombination.update({
      where: { id },
      data: updateData,
      include: { items: { include: { denomination: true } } },
    });

    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'combination.update', entity: 'FulfillmentCombination', entityId: id, metadata: { name: data.name, priority: data.priority, active: data.active } });
    }
    return updated;
  }

  async deleteCombination(id: string, actorId?: string) {
    await this.prisma.fulfillmentCombination.update({ where: { id }, data: { active: false } });
    if (actorId) {
      await this.auditService.log({ actorType: 'ADMIN', actorId, action: 'combination.deactivate', entity: 'FulfillmentCombination', entityId: id });
    }
    return { id, deactivated: true };
  }

  async getCombinationAvailability(id: string) {
    const combo = await this.prisma.fulfillmentCombination.findUnique({
      where: { id },
      include: { items: { include: { denomination: true } } },
    });
    if (!combo) throw new NotFoundException('Combination not found');

    const availability = await Promise.all(combo.items.map(async (item) => {
      const availableCount = await this.prisma.codeItem.count({
        where: { denominationId: item.denominationId, status: 'AVAILABLE' },
      });
      return {
        denominationId: item.denominationId,
        faceValue: Number(item.denomination.faceValue),
        required: item.quantity,
        available: availableCount,
        sufficient: availableCount >= item.quantity,
      };
    }));

    const fulfillable = availability.every((a) => a.sufficient);
    const totalValue = combo.items.reduce((sum, item) => sum + Number(item.denomination.faceValue) * item.quantity, 0);

    return { combinationId: id, name: combo.name, active: combo.active, priority: combo.priority, items: availability, fulfillable, totalValue };
  }

  async isCombinationFulfillable(combo: any): Promise<boolean> {
    for (const item of combo.items) {
      const availableCount = await this.prisma.codeItem.count({
        where: { denominationId: item.denominationId, status: 'AVAILABLE' },
      });
      if (availableCount < item.quantity) return false;
    }
    return true;
  }

  // ─── Catalog Hierarchy Query ───

  async getCatalogHierarchy() {
    const categories = await this.prisma.category.findMany({
      where: { active: true },
      include: {
        products: {
          where: { status: 'ACTIVE' },
          include: {
            productRegions: {
              where: { active: true },
              include: {
                region: true,
                variants: {
                  where: { active: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
            denominations: { orderBy: { faceValue: 'asc' } },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return categories;
  }

  // ─── Dashboard Stats ───

  async getCatalogStats() {
    const [totalProducts, activeProducts, totalRegions, totalVariants, totalCombinations, activeCombinations, categories] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: 'ACTIVE' } }),
      this.prisma.region.count(),
      this.prisma.variant.count(),
      this.prisma.fulfillmentCombination.count(),
      this.prisma.fulfillmentCombination.count({ where: { active: true } }),
      this.prisma.category.count(),
    ]);

    const inactiveProducts = totalProducts - activeProducts;
    const inactiveCombinations = totalCombinations - activeCombinations;

    // Count fulfillable combinations
    const allCombos = await this.prisma.fulfillmentCombination.findMany({
      where: { active: true },
      include: { items: true },
    });
    let fulfillableCount = 0;
    for (const c of allCombos) {
      let ok = true;
      for (const item of c.items) {
        const cnt = await this.prisma.codeItem.count({ where: { denominationId: item.denominationId, status: 'AVAILABLE' } });
        if (cnt < item.quantity) { ok = false; break; }
      }
      if (ok) fulfillableCount++;
    }

    return {
      categories: { total: categories },
      products: { total: totalProducts, active: activeProducts, inactive: inactiveProducts },
      regions: { total: totalRegions },
      variants: { total: totalVariants },
      combinations: { total: totalCombinations, active: activeCombinations, inactive: inactiveCombinations, fulfillable: fulfillableCount, unavailable: activeCombinations - fulfillableCount },
    };
  }
}
