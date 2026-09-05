import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveProductSkuBase, uniqueSku, normaliseSku, denominationSku } from './sku';

/**
 * One place that owns SKUs for both levels: the product ("PSN USA Digital Code"
 * → PSN-USA) and its sub-products, the denominations (PSN-USA-10). A SKU is how
 * a storefront line item is matched back to what to deliver, so both levels must
 * be visible, generatable and editable.
 */
@Injectable()
export class SkuService {
  private readonly logger = new Logger(SkuService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /** Every product with its denominations, each with its current SKU. */
  async list(search?: string) {
    const term = search?.trim();
    const products = await this.prisma.product.findMany({
      where: term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { region: { contains: term, mode: 'insensitive' } },
              { sku: { contains: term, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: { denominations: { orderBy: { faceValue: 'asc' } } },
      orderBy: [{ name: 'asc' }],
    });

    return {
      items: products.map((product) => ({
        id: product.id,
        name: product.name,
        region: product.region,
        status: product.status,
        sku: product.sku,
        suggested_sku: product.sku || resolveProductSkuBase(product.name, product.region),
        denominations: product.denominations.map((denomination) => ({
          id: denomination.id,
          face_value: Number(denomination.faceValue),
          currency: denomination.currency,
          sku: denomination.sku,
          suggested_sku: denominationSku(
            product.sku || resolveProductSkuBase(product.name, product.region),
            Number(denomination.faceValue),
          ),
        })),
      })),
      total: products.length,
    };
  }

  /** All SKUs currently taken at either level, for collision checks. */
  private async takenSkus(): Promise<Set<string>> {
    const [products, denominations] = await Promise.all([
      this.prisma.product.findMany({ where: { sku: { not: null } }, select: { sku: true } }),
      this.prisma.denomination.findMany({ where: { sku: { not: null } }, select: { sku: true } }),
    ]);
    return new Set(
      [...products, ...denominations].map((row) => normaliseSku(row.sku!)),
    );
  }

  /**
   * Fill in every missing SKU at both levels without touching ones already set,
   * so a deliberate SKU is never overwritten by a generated one.
   */
  async generateMissing(adminId: string, ip?: string) {
    const products = await this.prisma.product.findMany({
      include: { denominations: { orderBy: { faceValue: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    const taken = await this.takenSkus();
    const assigned: { level: 'product' | 'denomination'; id: string; name: string; sku: string }[] = [];

    for (const product of products) {
      let productSku = product.sku;
      if (!productSku) {
        productSku = uniqueSku(resolveProductSkuBase(product.name, product.region), taken);
        taken.add(normaliseSku(productSku));
        await this.prisma.product.update({ where: { id: product.id }, data: { sku: productSku } });
        assigned.push({ level: 'product', id: product.id, name: product.name, sku: productSku });
      }

      for (const denomination of product.denominations) {
        if (denomination.sku) continue;
        const sku = uniqueSku(denominationSku(productSku, Number(denomination.faceValue)), taken);
        taken.add(normaliseSku(sku));
        await this.prisma.denomination.update({ where: { id: denomination.id }, data: { sku } });
        assigned.push({
          level: 'denomination',
          id: denomination.id,
          name: `${product.name} $${Number(denomination.faceValue)}`,
          sku,
        });
      }
    }

    await this.auditService.log({
      actorType: 'ADMIN', actorId: adminId, action: 'sku.generate_missing',
      entity: 'Product', entityId: 'bulk', metadata: { assigned: assigned.length }, ip,
    });
    this.logger.log(`Generated ${assigned.length} missing SKU(s)`);
    return { assigned_count: assigned.length, assigned };
  }

  /** Reject a SKU already used by any product or denomination but this one. */
  private async assertFree(sku: string, ignore: { productId?: string; denominationId?: string }) {
    const [product, denomination] = await Promise.all([
      this.prisma.product.findFirst({
        where: { sku, ...(ignore.productId ? { id: { not: ignore.productId } } : {}) },
        select: { name: true },
      }),
      this.prisma.denomination.findFirst({
        where: { sku, ...(ignore.denominationId ? { id: { not: ignore.denominationId } } : {}) },
        include: { product: { select: { name: true } } },
      }),
    ]);
    if (product) throw new BadRequestException(`SKU ${sku} is already used by "${product.name}"`);
    if (denomination) {
      throw new BadRequestException(
        `SKU ${sku} is already used by "${denomination.product.name} $${Number(denomination.faceValue)}"`,
      );
    }
  }

  async setProductSku(productId: string, sku: string | null, adminId: string, ip?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const value = sku?.trim() ? normaliseSku(sku) : null;
    if (value) await this.assertFree(value, { productId });

    const updated = await this.prisma.product.update({
      where: { id: productId }, data: { sku: value },
    });
    await this.auditService.log({
      actorType: 'ADMIN', actorId: adminId, action: 'sku.set_product',
      entity: 'Product', entityId: productId, metadata: { from: product.sku, to: value }, ip,
    });
    return { id: updated.id, sku: updated.sku };
  }

  async setDenominationSku(denominationId: string, sku: string | null, adminId: string, ip?: string) {
    const denomination = await this.prisma.denomination.findUnique({ where: { id: denominationId } });
    if (!denomination) throw new NotFoundException('Denomination not found');

    const value = sku?.trim() ? normaliseSku(sku) : null;
    if (value) await this.assertFree(value, { denominationId });

    const updated = await this.prisma.denomination.update({
      where: { id: denominationId }, data: { sku: value },
    });
    await this.auditService.log({
      actorType: 'ADMIN', actorId: adminId, action: 'sku.set_denomination',
      entity: 'Denomination', entityId: denominationId,
      metadata: { from: denomination.sku, to: value }, ip,
    });
    return { id: updated.id, sku: updated.sku };
  }

  /**
   * Re-derive a product's denomination SKUs from its product SKU. Used after the
   * product SKU is renamed, so the sub-product SKUs do not drift from it.
   */
  async resyncDenominations(productId: string, adminId: string, ip?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { denominations: { orderBy: { faceValue: 'asc' } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (!product.sku) throw new BadRequestException('Set the product SKU first');

    const taken = await this.takenSkus();
    const updated: { id: string; sku: string }[] = [];
    for (const denomination of product.denominations) {
      const target = denominationSku(product.sku, Number(denomination.faceValue));
      if (denomination.sku && normaliseSku(denomination.sku) === target) continue;
      taken.delete(normaliseSku(denomination.sku ?? ''));
      const sku = uniqueSku(target, taken);
      taken.add(normaliseSku(sku));
      await this.prisma.denomination.update({ where: { id: denomination.id }, data: { sku } });
      updated.push({ id: denomination.id, sku });
    }
    await this.auditService.log({
      actorType: 'ADMIN', actorId: adminId, action: 'sku.resync_denominations',
      entity: 'Product', entityId: productId, metadata: { updated: updated.length }, ip,
    });
    return { updated_count: updated.length, updated };
  }
}
