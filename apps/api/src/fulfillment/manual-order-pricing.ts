import { BadRequestException } from '@nestjs/common';

/**
 * What a manual order costs.
 *
 * The admin enters **what to charge**, not a discount: an $80 order charged at
 * 77 shows a discount of 3. Entering the discount instead meant working out the
 * charge in your head, which is the number that actually matters.
 *
 * `amount` stays the allocation target — the codes handed over are still worth
 * $80 — so only the sale price moves.
 */
export function manualOrderPricing(amount: unknown, chargeAmount: unknown = undefined) {
  const isMoney = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) &&
    Number.isSafeInteger(Math.round(value * 100)) &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;

  if (!isMoney(amount) || amount <= 0) {
    throw new BadRequestException('amount must be a positive number with at most two decimal places');
  }

  // Only an omitted value means "charge the full amount"; null and anything
  // else non-numeric is malformed input and must not be read as "no discount".
  const charge = chargeAmount === undefined ? amount : chargeAmount;
  if (!isMoney(charge) || charge < 0 || charge > amount) {
    throw new BadRequestException(
      'chargeAmount must be a number between zero and amount with at most two decimal places',
    );
  }

  const cents = (value: number) => Math.round(value * 100);
  return {
    original_amount: amount,
    charge_amount: (cents(charge)) / 100,
    // Derived, so it always agrees with what is charged.
    discount_amount: (cents(amount) - cents(charge)) / 100,
    net_amount: (cents(charge)) / 100,
  };
}
