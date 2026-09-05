import { BadRequestException } from '@nestjs/common';

/** A discount changes the sale price only; amount remains the allocation target. */
export function manualOrderPricing(amount: unknown, discountAmount: unknown = 0) {
  const isMoney = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) &&
    Number.isSafeInteger(Math.round(value * 100)) &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;

  if (!isMoney(amount) || amount <= 0) {
    throw new BadRequestException('amount must be a positive number with at most two decimal places');
  }
  if (!isMoney(discountAmount) || discountAmount < 0 || discountAmount > amount) {
    throw new BadRequestException('discountAmount must be a number between zero and amount with at most two decimal places');
  }
  return {
    original_amount: amount,
    discount_amount: discountAmount,
    net_amount: (Math.round(amount * 100) - Math.round(discountAmount * 100)) / 100,
  };
}
