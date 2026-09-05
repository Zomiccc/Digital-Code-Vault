import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BASE_CURRENCY,
  assertValidRate,
  convertFromUsd,
  convertToUsd,
  normaliseCurrency,
  roundMoney,
} from './money';

/** A price converted out of USD, carrying the rate it was converted at. */
export type ConvertedPrice = {
  currency: string;
  amount: number;
  /** Units of `currency` per 1 USD at the moment of conversion. */
  rate: number;
  amountUsd: number;
};

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Units of `currency` per 1 USD. USD is the base and always returns 1.
   * A missing rate is a configuration gap, not a default: guessing here would
   * charge a merchant the wrong amount, so it fails loudly instead.
   */
  async getRate(currency: string): Promise<number> {
    const code = normaliseCurrency(currency);
    if (code === BASE_CURRENCY) return 1;

    const row = await this.prisma.exchangeRate.findUnique({ where: { currency: code } });
    if (!row) {
      throw new BadRequestException(
        `No exchange rate is set for ${code}. Set one in Finance before transacting in ${code}.`,
      );
    }
    return assertValidRate(Number(row.unitsPerUsd), code);
  }

  /** Convert a USD amount into `currency`, reporting the rate used. */
  async fromUsd(amountUsd: number, currency: string): Promise<ConvertedPrice> {
    const code = normaliseCurrency(currency);
    const rate = await this.getRate(code);
    return {
      currency: code,
      amount: code === BASE_CURRENCY ? roundMoney(amountUsd) : convertFromUsd(amountUsd, rate),
      rate,
      amountUsd: roundMoney(amountUsd),
    };
  }

  /** Convert an amount denominated in `currency` back into USD. */
  async toUsd(amount: number, currency: string): Promise<number> {
    const code = normaliseCurrency(currency);
    if (code === BASE_CURRENCY) return roundMoney(amount);
    return convertToUsd(amount, await this.getRate(code));
  }

  /** Every configured rate, with USD included so callers see a complete table. */
  async listRates() {
    const rows = await this.prisma.exchangeRate.findMany({ orderBy: { currency: 'asc' } });
    return [
      { currency: BASE_CURRENCY, units_per_usd: 1, updated_at: null, updated_by: null, is_base: true },
      ...rows.map((row) => ({
        currency: row.currency,
        units_per_usd: Number(row.unitsPerUsd),
        updated_at: row.updatedAt,
        updated_by: row.updatedBy,
        is_base: false,
      })),
    ];
  }

  /** Create or replace one currency's rate. */
  async setRate(currency: string, unitsPerUsd: number, adminId: string, ip?: string) {
    const code = normaliseCurrency(currency);
    if (code === BASE_CURRENCY) {
      throw new BadRequestException('USD is the base currency and always has a rate of 1');
    }
    const rate = assertValidRate(unitsPerUsd, code);

    const previous = await this.prisma.exchangeRate.findUnique({ where: { currency: code } });
    const saved = await this.prisma.exchangeRate.upsert({
      where: { currency: code },
      create: { currency: code, unitsPerUsd: rate, updatedBy: adminId },
      update: { unitsPerUsd: rate, updatedBy: adminId },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'currency.set_rate',
      entity: 'ExchangeRate',
      entityId: code,
      metadata: { currency: code, from: previous ? Number(previous.unitsPerUsd) : null, to: rate },
      ip,
    });

    this.logger.log(`Exchange rate ${code} set to ${rate} per USD by admin ${adminId}`);
    return { currency: saved.currency, units_per_usd: Number(saved.unitsPerUsd), updated_at: saved.updatedAt };
  }

  async deleteRate(currency: string, adminId: string, ip?: string) {
    const code = normaliseCurrency(currency);
    if (code === BASE_CURRENCY) {
      throw new BadRequestException('The base currency cannot be removed');
    }
    // A wallet left holding a currency with no rate could not be charged at all.
    const inUse = await this.prisma.merchant.count({ where: { currency: code } });
    if (inUse > 0) {
      throw new BadRequestException(
        `${code} is the wallet currency of ${inUse} merchant(s) and cannot be removed`,
      );
    }
    await this.prisma.exchangeRate.delete({ where: { currency: code } }).catch(() => undefined);
    await this.auditService.log({
      actorType: 'ADMIN', actorId: adminId, action: 'currency.delete_rate',
      entity: 'ExchangeRate', entityId: code, metadata: { currency: code }, ip,
    });
    return { currency: code, deleted: true };
  }
}
