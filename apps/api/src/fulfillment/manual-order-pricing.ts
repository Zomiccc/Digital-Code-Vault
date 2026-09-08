import { BadRequestException } from '@nestjs/common';

/**
 * What a manual order costs.
 *
 * The admin enters **what to charge** and that figure is simply recorded — there
 * is no cap. A manual sale is priced by hand, so charging above or below the
 * order value are both legitimate, and the platform's job is to record what was
 * actually charged rather than to police it.
 *
 * `amount` stays the allocation target: the codes handed over are worth the
 * order value regardless of what was charged for them. The difference is
 * reported as `discount_amount`, which is negative when the charge is higher —
 * a markup rather than a discount.
 *
 * That difference only means anything when both figures are in the same
 * currency. Charging 45,000 rupees for a $170 order is not a discount of
 * -44,830 of anything, so `sameCurrency: false` records the charge and leaves
 * the discount at zero rather than subtracting rupees from dollars.
 */
export function manualOrderPricing(
  amount: unknown,
  chargeAmount: unknown = undefined,
  sameCurrency = true,
) {
  const isMoney = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) &&
    Number.isSafeInteger(Math.round(value * 100)) &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;

  if (!isMoney(amount) || amount <= 0) {
    throw new BadRequestException('amount must be a positive number with at most two decimal places');
  }

  // Only an omitted value means "charge the order value"; null and anything
  // else non-numeric is malformed input and must not be read as "no discount".
  const charge = chargeAmount === undefined ? amount : chargeAmount;
  if (!isMoney(charge) || charge < 0) {
    throw new BadRequestException(
      'chargeAmount must be zero or more, with at most two decimal places',
    );
  }

  const cents = (value: number) => Math.round(value * 100);
  return {
    original_amount: amount,
    charge_amount: cents(charge) / 100,
    // Negative when the charge exceeds the order value; zero across currencies,
    // where the two figures cannot be subtracted from one another at all.
    discount_amount: sameCurrency ? (cents(amount) - cents(charge)) / 100 : 0,
    net_amount: cents(charge) / 100,
  };
}
