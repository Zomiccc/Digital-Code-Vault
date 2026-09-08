import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normaliseCurrency, roundMoney, BASE_CURRENCY } from './money';

export type PricedItem = 'DENOMINATION' | 'VARIANT';

/** A price, and whether it was set or worked out. */
export type ResolvedPrice = {
  currency: string;
  amount: number;
  /** True when an explicit price exists for this currency. */
  explicit: boolean;
};

/**
 * Selling prices, per currency.
 *
 * Inventory cost lives on the batch, in whatever currency that batch was bought
 * in. The selling price is a different thing entirely and has to exist in every
 * currency the platform sells in — a merchant paying from a rupee balance is
 * charged the rupee price that was set, not a dollar price run through a rate.
 *
 * A currency with no price set has no price: the item cannot be sold in that
 * currency, and a wallet holding it is passed over. There is no exchange rate
 * to fall back on, because inventing a price is exactly what the platform was
 * asked to stop doing.
 */
@Injectable()
export class SellingPriceService {
  private readonly logger = new Logger(SellingPriceService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /** Every price set for one item, keyed by currency. */
  async listPrices(itemType: PricedItem, itemId: string) {
    const rows = await this.prisma.sellingPrice.findMany({
      where: { itemType, itemId },
      orderBy: { currency: 'asc' },
    });
    return rows.map((row) => ({
      currency: row.currency,
      amount: Number(row.amount),
      updated_at: row.updatedAt,
    }));
  }

  /**
   * What this item sells for in `currency`, or null if it is not sold in it.
   *
   * An explicit price wins. Failing that, an item already denominated in that
   * currency is its own price. Anything else returns null: the platform will
   * not invent a figure to charge a merchant, so an item with no rupee price
   * cannot be bought from a rupee wallet until an admin sets one.
   */
  async priceIn(
    itemType: PricedItem,
    itemId: string,
    currency: string,
    base: { amount: number; currency: string },
  ): Promise<ResolvedPrice | null> {
    const code = normaliseCurrency(currency);
    const baseCode = normaliseCurrency(base.currency || BASE_CURRENCY);

    const explicit = await this.prisma.sellingPrice.findUnique({
      where: { itemType_itemId_currency: { itemType, itemId, currency: code } },
    });
    if (explicit) {
      return { currency: code, amount: Number(explicit.amount), explicit: true };
    }

    if (code === baseCode) {
      return { currency: code, amount: roundMoney(base.amount), explicit: false };
    }

    return null;
  }

  /** Set or replace one currency's price. */
  async setPrice(
    itemType: PricedItem,
    itemId: string,
    currency: string,
    amount: number,
    adminId?: string,
    ip?: string,
  ) {
    const code = normaliseCurrency(currency);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Price must be a positive number');
    }
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
      throw new BadRequestException('Price must have at most two decimal places');
    }

    const previous = await this.prisma.sellingPrice.findUnique({
      where: { itemType_itemId_currency: { itemType, itemId, currency: code } },
    });
    const saved = await this.prisma.sellingPrice.upsert({
      where: { itemType_itemId_currency: { itemType, itemId, currency: code } },
      create: { itemType, itemId, currency: code, amount, updatedBy: adminId },
      update: { amount, updatedBy: adminId },
    });

    if (adminId) {
      await this.auditService.log({
        actorType: 'ADMIN', actorId: adminId, action: 'price.set',
        entity: itemType, entityId: itemId,
        metadata: {
          currency: code,
          from: previous ? Number(previous.amount) : null,
          to: amount,
        },
        ip,
      });
    }
    return { currency: saved.currency, amount: Number(saved.amount) };
  }

  async removePrice(itemType: PricedItem, itemId: string, currency: string, adminId?: string, ip?: string) {
    const code = normaliseCurrency(currency);
    await this.prisma.sellingPrice
      .delete({ where: { itemType_itemId_currency: { itemType, itemId, currency: code } } })
      .catch(() => undefined);
    if (adminId) {
      await this.auditService.log({
        actorType: 'ADMIN', actorId: adminId, action: 'price.remove',
        entity: itemType, entityId: itemId, metadata: { currency: code }, ip,
      });
    }
    // Removing a currency's price does unprice the item in that currency. It
    // stays sellable in the currency it is denominated in, and in any other
    // currency an admin has priced it in.
    return { currency: code, removed: true };
  }

  /**
   * Prices for many items at once, so a listing does not query per row.
   * Returns a map of `itemId` to its prices by currency.
   */
  async pricesForItems(itemType: PricedItem, itemIds: string[]) {
    if (!itemIds.length) return new Map<string, Record<string, number>>();
    const rows = await this.prisma.sellingPrice.findMany({
      where: { itemType, itemId: { in: itemIds } },
    });
    const byItem = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const entry = byItem.get(row.itemId) ?? {};
      entry[row.currency] = Number(row.amount);
      byItem.set(row.itemId, entry);
    }
    return byItem;
  }
}
