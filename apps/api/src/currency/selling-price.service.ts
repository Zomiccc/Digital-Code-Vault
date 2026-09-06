import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrencyService } from './currency.service';
import { normaliseCurrency, roundMoney, convertFromUsd, convertToUsd, BASE_CURRENCY } from './money';

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
 * A currency with no price set falls back to converting the item's own price at
 * the admin rate, so nothing is ever unpriced and this could be introduced
 * without repricing the catalogue by hand.
 */
@Injectable()
export class SellingPriceService {
  private readonly logger = new Logger(SellingPriceService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private currencyService: CurrencyService,
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
   * What this item sells for in `currency`.
   *
   * An explicit price wins. Otherwise the item's own price is converted — via
   * USD, so any pair works — and `explicit` says which happened, letting a
   * caller show "set" prices differently from derived ones.
   */
  async priceIn(
    itemType: PricedItem,
    itemId: string,
    currency: string,
    base: { amount: number; currency: string },
  ): Promise<ResolvedPrice> {
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

    // Neither set nor same-currency: go through USD so any pair converts.
    const amountUsd = baseCode === BASE_CURRENCY
      ? base.amount
      : convertToUsd(base.amount, await this.currencyService.getRate(baseCode));
    const rate = await this.currencyService.getRate(code);
    return {
      currency: code,
      amount: code === BASE_CURRENCY ? roundMoney(amountUsd) : convertFromUsd(amountUsd, rate),
      explicit: false,
    };
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
    // Removing an explicit price does not unprice the item; it goes back to
    // being converted from the item's own price.
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
