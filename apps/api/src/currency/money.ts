import { BadRequestException } from '@nestjs/common';

/** USD is the base unit for every stored price; its rate is always exactly 1. */
export const BASE_CURRENCY = 'USD';

/** ISO-4217-shaped code. Storing a normalised code keeps lookups exact. */
export function normaliseCurrency(currency: unknown): string {
  const code = String(currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new BadRequestException(`Currency must be a three-letter code, received "${currency}"`);
  }
  return code;
}

/**
 * Rates are "units of the target currency per 1 USD" — 300 means $1 buys 300 PKR.
 * A rate of zero or below, or one large enough to lose integer precision in cents,
 * would silently corrupt balances, so it is rejected at the boundary.
 */
export function assertValidRate(rate: unknown, currency: string): number {
  const value = typeof rate === 'string' ? Number(rate) : rate;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`Exchange rate for ${currency} must be a positive number`);
  }
  if (value > 1_000_000) {
    throw new BadRequestException(`Exchange rate for ${currency} is implausibly large`);
  }
  return value;
}

/** Round to whole cents, away from zero, so repeated conversions cannot drift down. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    throw new BadRequestException('Amount must be a finite number');
  }
  const cents = Math.round(Math.abs(value) * 100 + Number.EPSILON);
  return (Math.sign(value) || 1) * cents / 100;
}

/** Convert a USD amount into `currency` at `unitsPerUsd`. */
export function convertFromUsd(amountUsd: number, unitsPerUsd: number): number {
  return roundMoney(amountUsd * unitsPerUsd);
}

/** Convert an amount in `currency` back to USD at `unitsPerUsd`. */
export function convertToUsd(amount: number, unitsPerUsd: number): number {
  return roundMoney(amount / unitsPerUsd);
}
