import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BASE_CURRENCY, formatMoney, roundMoney, symbolFor } from './money';

/** How one region's prices should be presented. */
export type RegionDisplay = {
  currency: string;
  symbol: string;
  region: string | null;
};

/**
 * Present an amount in the currency it is already denominated in.
 *
 * Nothing is converted here, because there is nothing to convert at: every
 * price the platform charges is set by an admin, per item and per currency. A
 * face value stored as 250 Lira is shown as 250 Lira rather than being run
 * through a rate - which is what used to turn a Turkish code into "$250".
 */
export function localPrice(
  amount: number,
  currency?: string | null,
  display?: RegionDisplay,
) {
  // Display code runs over whatever the catalogue holds, including a row with a
  // missing face value. A price that cannot be read shows as zero rather than
  // throwing and taking the surrounding listing with it.
  const safe = Number.isFinite(amount) ? amount : 0;
  const code = String(currency || display?.currency || BASE_CURRENCY).toUpperCase();
  return {
    local_amount: roundMoney(safe),
    local_currency: code,
    local_symbol: symbolFor(code),
    local_formatted: formatMoney(safe, code),
  };
}

/**
 * Which currency a region reads in.
 *
 * This is presentation only - the label and symbol a listing is written with.
 * What a merchant is actually charged comes from the selling price an admin set
 * for that currency, never from converting one currency into another.
 */
@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(private prisma: PrismaService) {}

  async displayCurrencyForRegion(regionCode: string | null | undefined): Promise<RegionDisplay> {
    const fallback: RegionDisplay = {
      currency: BASE_CURRENCY, symbol: '$', region: regionCode ?? null,
    };
    const code = (regionCode ?? '').trim();
    if (!code) return fallback;

    // Naming a region's currency must never be able to take the catalogue down
    // with it, so every failure here - a missing table, an unmigrated database,
    // a stale Prisma client - degrades to USD.
    try {
      const region = await this.prisma.region.findFirst({
        where: { OR: [{ code }, { name: code }] },
        select: { currency: true, symbol: true },
      });
      if (!region) return fallback;
      const currency = (region.currency || BASE_CURRENCY).toUpperCase();
      return { currency, symbol: region.symbol || symbolFor(currency), region: code };
    } catch (err) {
      this.logger.error(
        `Could not resolve display currency for region ${code}; showing USD: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  /** Resolve display currencies for many regions at once, without an N+1. */
  async displayCurrenciesForRegions(regionCodes: (string | null | undefined)[]) {
    const unique = [...new Set(regionCodes.map((code) => (code ?? '').trim()).filter(Boolean))];
    const entries = await Promise.all(
      unique.map(async (code) => [code, await this.displayCurrencyForRegion(code)] as const),
    );
    return new Map(entries);
  }
}
