import { BadRequestException } from '@nestjs/common';

/** USD is the base unit: the currency a price is assumed to be in when none is stated. */
export const BASE_CURRENCY = 'USD';

/** ISO-4217-shaped code. Storing a normalised code keeps lookups exact. */
export function normaliseCurrency(currency: unknown): string {
  const code = String(currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new BadRequestException(`Currency must be a three-letter code, received "${currency}"`);
  }
  return code;
}

/** Round to whole cents, away from zero, so repeated conversions cannot drift down. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    throw new BadRequestException('Amount must be a finite number');
  }
  const cents = Math.round(Math.abs(value) * 100 + Number.EPSILON);
  return (Math.sign(value) || 1) * cents / 100;
}

/** Symbols for the currencies the platform prices or sells in. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', PKR: '₨', SAR: '﷼', TRY: '₺', AED: 'د.إ',
  GBP: '£', EUR: '€', CAD: 'CA$', AUD: 'A$', INR: '₹',
  QAR: 'ر.ق', HKD: 'HK$',
};

/** The symbol a currency is written with, or its own code when it has none. */
export function symbolFor(currency?: string | null): string {
  const code = String(currency || BASE_CURRENCY).toUpperCase();
  return CURRENCY_SYMBOLS[code] || code;
}

/**
 * Money as a customer should read it, in the currency it is actually in.
 *
 * Server-rendered output — the delivery page, delivery emails — printed a dollar
 * sign in front of every figure, so a Turkish customer was shown "$250" for a
 * 250 Lira code. An unmapped currency falls back to its own code rather than
 * borrowing another currency's symbol.
 */
export function formatMoney(amount: unknown, currency?: string | null): string {
  const code = String(currency || BASE_CURRENCY).toUpperCase();
  const value = Number(amount);
  const shown = (Number.isFinite(value) ? value : 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const symbol = CURRENCY_SYMBOLS[code];
  return symbol ? `${symbol}${shown}` : `${code} ${shown}`;
}
