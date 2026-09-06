import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Symbols for the currencies a wallet or a code value can be held in. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', PKR: '\u20a8', SAR: '\ufdfc', TRY: '\u20ba', AED: '\u062f.\u0625',
  GBP: '\u00a3', EUR: '\u20ac', CAD: 'CA$', AUD: 'A$', INR: '\u20b9',
  QAR: '\u0631.\u0642', HKD: 'HK$',
};

/**
 * The currency this merchant's wallet is held in.
 *
 * Every figure on the dashboard is a wallet figure — balance, spend, order
 * totals — and a merchant has exactly one wallet currency, so it is resolved
 * once when the wallet loads rather than threaded through every call site.
 * formatCurrency used to hardcode USD, which showed a PKR wallet's balance with
 * a dollar sign.
 */
let walletCurrency = 'USD';

export function setWalletCurrency(currency?: string | null) {
  if (currency && /^[A-Za-z]{3}$/.test(currency)) walletCurrency = currency.toUpperCase();
}

export function getWalletCurrency(): string {
  return walletCurrency;
}

export function getCurrencySymbol(currency?: string | null): string {
  if (!currency) return CURRENCY_SYMBOLS[walletCurrency] || `${walletCurrency} `;
  return CURRENCY_SYMBOLS[currency.toUpperCase()] || `${currency.toUpperCase()} `;
}

/** A wallet figure. Defaults to the wallet's own currency, never to dollars. */
export function formatCurrency(value: number | string, currency?: string | null): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const safe = Number.isFinite(num) ? num : 0;
  return `${getCurrencySymbol(currency)}${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

/** A figure in a stated currency, such as a code's face value. */
export function formatPrice(value: number | string | null | undefined, currency?: string | null): string {
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  return `${getCurrencySymbol(currency || 'USD')}${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

export function formatDate(date: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    ALLOCATED: 'bg-blue-100 text-blue-700',
    DELIVERED: 'bg-purple-100 text-purple-700',
    FAILED: 'bg-red-100 text-red-700',
    REVERSED: 'bg-orange-100 text-orange-700',
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    SUSPENDED: 'bg-amber-100 text-amber-700',
    DISABLED: 'bg-red-100 text-red-700',
    AVAILABLE: 'bg-emerald-100 text-emerald-700',
    VOID: 'bg-red-100 text-red-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

export function getGoogleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
