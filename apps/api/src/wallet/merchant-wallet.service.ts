import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normaliseCurrency, roundMoney, BASE_CURRENCY } from '../currency/money';

/** A wallet chosen to pay for an order, with the charge worked out. */
export type ChosenWallet = {
  walletId: string;
  currency: string;
  /** What the order costs in this wallet's currency. */
  amount: number;
  balance: number;
};

/** Why no wallet could pay, for a message the merchant can act on. */
export type WalletShortfall = {
  currency: string;
  balance: number;
  required: number;
  /** `no_rate` covers any currency the order could not be priced in. */
  reason: 'insufficient' | 'no_price';
};

/**
 * A merchant's balances, one per currency.
 *
 * A merchant holds PKR and USD side by side rather than a single wallet whose
 * currency is switched. Deposits land in the chosen currency and nothing is
 * converted until an order is paid, so a rate change never rewrites a balance.
 *
 * An order is paid entirely from one wallet: the preferred wallet is tried
 * first, and if it cannot cover the whole order the next one is used instead.
 * Orders are never split across two wallets, so each has one clear source and
 * a refund goes back where the money came from.
 */
@Injectable()
export class MerchantWalletService {
  private readonly logger = new Logger(MerchantWalletService.name);

  /** Offered to every merchant so both are available without a settings change. */
  private readonly defaultCurrencies = [BASE_CURRENCY, 'PKR'];

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * The merchant's wallets in the order they are spent, creating any that are
   * missing. Reading the balances is what most callers want, and a merchant who
   * has never been set up should still see two empty wallets rather than none.
   */
  async listWallets(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, currency: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const existing = await this.prisma.merchantWallet.findMany({ where: { merchantId } });
    const have = new Set(existing.map((wallet) => wallet.currency));

    // The merchant's own currency first, so a pre-existing PKR merchant keeps
    // spending PKR by default rather than being switched to dollars.
    const wanted = [
      normaliseCurrency(merchant.currency || BASE_CURRENCY),
      ...this.defaultCurrencies,
    ].filter((currency, index, all) => all.indexOf(currency) === index);

    const missing = wanted.filter((currency) => !have.has(currency));
    if (missing.length) {
      await this.prisma.merchantWallet.createMany({
        data: missing.map((currency, index) => ({
          merchantId,
          currency,
          balance: 0,
          spendOrder: wanted.indexOf(currency) >= 0 ? wanted.indexOf(currency) : existing.length + index,
        })),
        skipDuplicates: true,
      });
    }

    const wallets = await this.prisma.merchantWallet.findMany({
      where: { merchantId },
      orderBy: [{ spendOrder: 'asc' }, { currency: 'asc' }],
    });
    return wallets.map((wallet) => ({
      id: wallet.id,
      currency: wallet.currency,
      balance: Number(wallet.balance),
      spend_order: wallet.spendOrder,
    }));
  }

  /**
   * Which wallet pays for an order, and how much it pays.
   *
   * The cost is asked for **per candidate currency** rather than converted from
   * one figure, because a selling price is set per currency: a $100 code priced
   * at $101 and at ₨27,500 costs exactly those amounts, and ₨27,500 is not
   * $101 times a rate. `costInCurrency` returns null for a currency it cannot
   * price, which is treated the same as a missing rate — skipped, never guessed.
   *
   * Walks the wallets in the merchant's spend order and returns the first that
   * can cover the whole cost.
   */
  async chooseWalletForCharge(
    merchantId: string,
    costInCurrency: (currency: string) => Promise<number | null>,
  ): Promise<{ chosen: ChosenWallet | null; shortfalls: WalletShortfall[] }> {
    const wallets = await this.listWallets(merchantId);
    const shortfalls: WalletShortfall[] = [];

    for (const wallet of wallets) {
      let required: number | null;
      try {
        required = await costInCurrency(wallet.currency);
      } catch {
        required = null;
      }
      if (required === null) {
        shortfalls.push({
          currency: wallet.currency, balance: wallet.balance, required: 0, reason: 'no_price',
        });
        continue;
      }

      if (wallet.balance >= required) {
        return {
          chosen: {
            walletId: wallet.id, currency: wallet.currency,
            amount: required, balance: wallet.balance,
          },
          shortfalls,
        };
      }
      shortfalls.push({
        currency: wallet.currency, balance: wallet.balance, required, reason: 'insufficient',
      });
    }

    return { chosen: null, shortfalls };
  }

  /** A message naming what each wallet holds against what the order needs. */
  describeShortfall(shortfalls: WalletShortfall[]): string {
    if (!shortfalls.length) return 'No wallet is available to charge.';
    const parts = shortfalls.map((entry) =>
      entry.reason === 'no_price'
        ? `${entry.currency} has no selling price set for this item`
        : `${entry.currency} holds ${entry.balance} of ${entry.required} needed`,
    );
    return `Insufficient wallet balance. ${parts.join('; ')}.`;
  }

  /** Add funds to one currency's balance. Used when funding is approved. */
  async credit(
    merchantId: string,
    currency: string,
    amount: number,
    options: { referenceId?: string; adminId?: string; ip?: string } = {},
  ) {
    const code = normaliseCurrency(currency);
    const value = roundMoney(amount);
    if (value <= 0) throw new BadRequestException('Amount must be greater than zero');

    await this.listWallets(merchantId);
    const wallet = await this.prisma.merchantWallet.update({
      where: { merchantId_currency: { merchantId, currency: code } },
      data: { balance: { increment: value } },
    });

    await this.prisma.walletTransaction.create({
      data: {
        merchantId,
        type: 'CREDIT',
        amount: value,
        currency: code,
        balanceAfter: wallet.balance,
        referenceId: options.referenceId,
      },
    });

    if (options.adminId) {
      await this.auditService.log({
        actorType: 'ADMIN', actorId: options.adminId, action: 'wallet.credit',
        entity: 'MerchantWallet', entityId: wallet.id,
        metadata: { merchantId, currency: code, amount: value, balanceAfter: Number(wallet.balance) },
        ip: options.ip,
      });
    }
    return { currency: code, balance: Number(wallet.balance), credited: value };
  }

  /**
   * Set which wallet is spent from first. Currencies not listed keep their
   * place after the ones that are, so naming a single preference is enough.
   */
  async setSpendOrder(merchantId: string, order: string[], actorId?: string, ip?: string) {
    const wallets = await this.listWallets(merchantId);
    const requested = (order || []).map((currency) => normaliseCurrency(currency));
    const unknown = requested.filter(
      (currency) => !wallets.some((wallet) => wallet.currency === currency),
    );
    if (unknown.length) {
      throw new BadRequestException(`No ${unknown.join(', ')} wallet on this account`);
    }

    const ranked = [
      ...requested,
      ...wallets.map((wallet) => wallet.currency).filter((currency) => !requested.includes(currency)),
    ];
    await this.prisma.$transaction(
      ranked.map((currency, index) =>
        this.prisma.merchantWallet.update({
          where: { merchantId_currency: { merchantId, currency } },
          data: { spendOrder: index },
        }),
      ),
    );

    if (actorId) {
      await this.auditService.log({
        actorType: 'MERCHANT', actorId, action: 'wallet.set_spend_order',
        entity: 'Merchant', entityId: merchantId, metadata: { order: ranked }, ip,
      });
    }
    return this.listWallets(merchantId);
  }
}
