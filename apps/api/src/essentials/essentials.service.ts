import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class EssentialsService {
  private readonly logger = new Logger(EssentialsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Returns the current denomination-based delivery configuration for an Essentials
   * product, e.g. [{ denominationId, faceValue: 10, quantity: 1 }, { ..., faceValue: 20, quantity: 1 }].
   * This is a REUSABLE RULE — no individual inventory codes are referenced here.
   */
  async getDeliveryConfig(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException({ error: 'NOT_FOUND', code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
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

  /**
   * Saves (replaces) the denomination+quantity delivery rule for an Essentials product.
   * Example input: [{ denominationId: 'x', quantity: 1 }, { denominationId: 'y', quantity: 1 }]
   *
   * Validation:
   * - Must have at least one item.
   * - Quantity must be >= 1.
   * - Each denomination must exist and belong to THIS product.
   * - No duplicate denomination rows.
   *
   * This does NOT touch any inventory codes — it only stores the rule. Actual code
   * selection happens automatically at fulfillment time (see FulfillmentService).
   */
  async saveDeliveryConfig(
    productId: string,
    items: { denominationId: string; quantity: number }[],
    actorId?: string,
  ) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException({ error: 'NOT_FOUND', code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
    }

    if (!items || items.length === 0) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'EMPTY_DELIVERY_CONFIG',
        message: 'An Essentials product must have at least one delivery item (denomination + quantity)',
      });
    }

    const seen = new Set<string>();
    for (const item of items) {
      if (!item.denominationId) {
        throw new BadRequestException({ error: 'INVALID_REQUEST', code: 'MISSING_DENOMINATION', message: 'denominationId is required for every item' });
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new BadRequestException({ error: 'INVALID_REQUEST', code: 'INVALID_QUANTITY', message: `Quantity for denomination ${item.denominationId} must be an integer >= 1` });
      }
      if (seen.has(item.denominationId)) {
        throw new BadRequestException({ error: 'INVALID_REQUEST', code: 'DUPLICATE_DENOMINATION', message: `Denomination ${item.denominationId} is listed more than once` });
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
        throw new BadRequestException({ error: 'INVALID_REQUEST', code: 'DENOMINATION_NOT_FOUND', message: `Denomination ${item.denominationId} does not exist` });
      }
      if (denom.productId !== productId) {
        throw new BadRequestException({ error: 'INVALID_REQUEST', code: 'DENOMINATION_WRONG_PRODUCT', message: `Denomination ${item.denominationId} does not belong to this product` });
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

  /**
   * Checks whether all required denominations currently have sufficient AVAILABLE
   * inventory to fulfill one order of this Essentials product right now.
   * Mirrors the exact check performed by FulfillmentService at purchase time.
   */
  async getAvailability(productId: string) {
    const config = await this.getDeliveryConfig(productId);

    if (config.items.length === 0) {
      return { productId, ready: false, reason: 'NO_DELIVERY_CONFIG', items: [] };
    }

    const results = await Promise.all(
      config.items.map(async (item) => {
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
      }),
    );

    const ready = results.every((r) => r.sufficient);

    return { productId, ready, items: results };
  }
}
