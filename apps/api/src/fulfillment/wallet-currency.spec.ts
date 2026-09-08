// Run: node -r ts-node/register/transpile-only --test src/fulfillment/wallet-currency.spec.ts
// A wallet is charged the price set for its own currency, and the platform's
// books stay in USD. Nothing is converted: there are no exchange rates.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FulfillmentService } from './fulfillment.service';

function fixture(options: {
  walletCurrency: string;
  balance: number;
  /** The price an admin set per currency. A currency with none is unpriced. */
  prices?: Record<string, number>;
}) {
  let saved: any;
  let preset: any = null;
  let stock: any[] = [{ denominationId: 'denom100', faceValue: 100, availableCount: 4 }];
  let cached: any;
  const walletRows: any[] = [];
  const revenueRecords: any[] = [];
  const merchantUpdates: any[] = [];
  let platformBalance = 0;
  let priceLookups = 0;
  const merchant = {
    id: 'merchant', name: 'Shop', status: 'ACTIVE', allowedProductIds: '[]',
    walletBalance: options.balance, currency: options.walletCurrency,
  };
  const prisma: any = {
    platformSetting: { findUnique: async () => null },
    merchant: {
      findUnique: async () => merchant,
      update: async ({ data }: any) => {
        merchantUpdates.push(data);
        merchant.walletBalance = Number(merchant.walletBalance) - Number(data.walletBalance.decrement ?? 0);
        return { ...merchant };
      },
    },
    walletTransaction: { create: async ({ data }: any) => { walletRows.push(data); return data; } },
    merchantWallet: {
      update: async ({ data }: any) => {
        merchantUpdates.push({ walletBalance: data.balance });
        merchant.walletBalance = Number(merchant.walletBalance) - Number(data.balance.decrement ?? 0);
        return { balance: merchant.walletBalance, currency: options.walletCurrency };
      },
      upsert: async ({ update }: any) => {
        merchant.walletBalance = Number(merchant.walletBalance) + Number(update.balance.increment ?? 0);
        return { balance: merchant.walletBalance, currency: options.walletCurrency };
      },
    },
    denomination: {
      findMany: async ({ where }: any) => where.id.in.map((id: string) => ({
        id, faceValue: id === 'd10' ? 10 : id === 'd20' ? 20 : 100, currency: 'USD',
      })),
    },
    variant: { findUnique: async () => ({ id: 'v-ess-1m', customerPrice: 9.99, currency: 'USD' }) },
    product: { findUnique: async () => ({ id: 'product', name: 'Code', status: 'ACTIVE', productType: 'NORMAL' }) },
    fulfillmentRequest: {
      findUnique: async () => saved,
      create: async ({ data }: any) => saved = { ...data, id: 'order', createdAt: new Date(), allocations: [] },
      update: async ({ data }: any) => saved = { ...saved, ...data },
      findMany: async () => [saved],
      count: async () => 1,
    },
    idempotencyRecord: {
      findUnique: async () => cached,
      create: async ({ data }: any) => cached = data,
    },
    deliveryToken: { create: async () => ({}) },
    adminWallet: { update: async ({ data }: any) => {
      platformBalance += Number(data.balance.increment ?? 0) - Number(data.balance.decrement ?? 0);
      return { balance: platformBalance };
    } },
    fulfillmentCombination: {
      findMany: async () => preset
        ? [{ id: 'combo', name: 'Pack', items: preset }]
        : [],
    },
    adminWalletTransaction: {
      create: async ({ data }: any) => { revenueRecords.push(data); return data; },
      findFirst: async () => revenueRecords.find((r) => r.type === 'CREDIT'),
    },
    $transaction: async (callback: any) => callback(prisma),
  };
  const engine: any = {
    getAvailableStock: async () => stock,
    findBestCombination: (_stock: any, amount: number) => amount === 100
      ? [{ denominationId: 'denom100', faceValue: 100, count: 1 }] : null,
    reserveCodes: async (_tx: any, _id: any, combination: any) => combination.map(() => ({
      codeItemIds: ['code1'],
    })),
    confirmAllocation: async () => {},
    reverseAllocation: async () => {},
  };
  const service = new FulfillmentService(
    prisma, { get: (_key: string, fallback: any) => fallback } as any,
    { generateToken: () => 'token', hashToken: () => 'hash' } as any,
    { log: async () => {} } as any, engine,
    { queueWebhookEvent: async () => {} } as any,
    { sendDeliveryLinkEmail: async () => true, sendCustomerDeliveryEmail: async () => true } as any,
    { recordOrder: async () => {}, queueOrder: async () => {} } as any,
    { getOrCreateAdminWallet: async () => 'admin-wallet' } as any,
    // Prices: the figure an admin set for that currency, or nothing. An item
    // denominated in the wallet's own currency is its own price. There is no
    // rate to fall back on, which is the point.
    {
      priceIn: async (_type: any, _id: any, currency: string, base: any) => {
        priceLookups++;
        const explicit = options.prices?.[currency];
        if (explicit !== undefined) return { currency, amount: explicit, explicit: true };
        if (currency === (base.currency || 'USD')) {
          return { currency, amount: base.amount, explicit: false };
        }
        return null;
      },
    } as any,
    {
      chooseWalletForCharge: async (_merchantId: string, costInCurrency: any) => {
        const required = await costInCurrency(options.walletCurrency).catch(() => null);
        if (required === null) {
          return { chosen: null, shortfalls: [{ currency: options.walletCurrency, balance: options.balance, required: 0, reason: 'no_price' }] };
        }
        if (Number(merchant.walletBalance) < required) {
          return { chosen: null, shortfalls: [{ currency: options.walletCurrency, balance: Number(merchant.walletBalance), required, reason: 'insufficient' }] };
        }
        return {
          chosen: { walletId: 'w1', currency: options.walletCurrency, amount: required, balance: Number(merchant.walletBalance) },
          shortfalls: [],
        };
      },
      describeShortfall: (shortfalls: any[]) =>
        `Insufficient wallet balance. ${shortfalls.map((entry: any) =>
          entry.reason === 'no_price'
            ? `${entry.currency} has no selling price set for this item`
            : `${entry.currency} holds ${entry.balance} of ${entry.required} needed`).join('; ')}.`,
    } as any,
  );
  return {
    service, walletRows, revenueRecords, merchantUpdates, merchant,
    setPreset: (items: any) => { preset = items; },
    engineStock: (next: any[]) => { stock = next; },
    get platformBalance() { return platformBalance; },
    get saved() { return saved; },
    get priceLookups() { return priceLookups; },
  };
}

const order = {
  merchantId: 'merchant', productId: 'product', amount: 100, currency: 'USD',
  idempotencyKey: 'k', actorType: 'MERCHANT' as const,
};

test('a PKR wallet is debited the rupee price the admin set for the item', async () => {
  // A $100 code priced at PKR 27,500. That figure is charged as entered; the
  // platform no longer holds a rate it could have multiplied 100 by.
  const f = fixture({ walletCurrency: 'PKR', balance: 67000, prices: { PKR: 27500 } });
  const result = await f.service.createFulfillment({ ...order });

  assert.equal(result.status, 'ALLOCATED');
  assert.deepEqual(f.merchantUpdates, [{ walletBalance: { decrement: 27500 } }]);
  assert.equal(Number(f.merchant.walletBalance), 39500, 'PKR 67,000 less PKR 27,500');

  const debit = f.walletRows.find((row) => row.type === 'DEBIT');
  assert.equal(debit.amount, 27500);
  assert.equal(debit.currency, 'PKR');

  // The order keeps the order value plus what was actually charged.
  assert.equal(Number(f.saved.amount), 100);
  assert.equal(f.saved.chargedCurrency, 'PKR');
  assert.equal(f.saved.chargedAmount, 27500);
});

test('a wallet with no price set for the item is refused, not guessed at', async () => {
  // The old behaviour converted the dollar price at the admin rate. With rates
  // gone, an unpriced currency simply cannot buy the item.
  const f = fixture({ walletCurrency: 'PKR', balance: 67000 });
  await assert.rejects(
    () => f.service.createFulfillment({ ...order }),
    /PKR has no selling price set for this item/,
  );
  assert.deepEqual(f.merchantUpdates, [], 'no debit may be attempted');
  assert.equal(f.walletRows.length, 0);
});

test('a USD wallet is charged the face value with no conversion', async () => {
  const f = fixture({ walletCurrency: 'USD', balance: 500 });
  await f.service.createFulfillment({ ...order });

  assert.deepEqual(f.merchantUpdates, [{ walletBalance: { decrement: 100 } }]);
  const debit = f.walletRows.find((row) => row.type === 'DEBIT');
  assert.equal(debit.amount, 100);
  assert.equal(debit.currency, 'USD');
  assert.equal(f.saved.fxRate, 1);
});

test('a wallet the order cannot be priced in refuses rather than guessing', async () => {
  const f = fixture({ walletCurrency: 'TRY', balance: 100000 });
  await assert.rejects(
    () => f.service.createFulfillment({ ...order }),
    /TRY has no selling price set for this item/,
  );
  assert.deepEqual(f.merchantUpdates, []);
  assert.equal(f.walletRows.length, 0);
});

test('the price is read once per order so a mid-order change cannot split the charge', async () => {
  const f = fixture({ walletCurrency: 'PKR', balance: 67000, prices: { PKR: 27500 } });
  await f.service.createFulfillment({ ...order });
  assert.equal(f.priceLookups, 1);
});

// ─── A pack preset decides what is delivered, and what is charged ───

test('a preset delivers its codes even though they do not add up to the shelf price', async () => {
  // "PS Essential: 1 Month" sells for 9.99 but is delivered as $10 + $20. The
  // order used to be rejected with "no combination exactly sums to 9.99".
  const f = fixture({ walletCurrency: 'USD', balance: 500 });
  f.engineStock([
    { denominationId: 'd10', faceValue: 10, availableCount: 5 },
    { denominationId: 'd20', faceValue: 20, availableCount: 5 },
  ]);
  f.setPreset([
    { denominationId: 'd10', quantity: 1, denomination: { faceValue: 10 } },
    { denominationId: 'd20', quantity: 1, denomination: { faceValue: 20 } },
  ]);

  const result = await f.service.createFulfillment({
    ...order, amount: 9.99, variantId: 'v-ess-1m',
  });

  assert.equal(result.status, 'ALLOCATED');
  // Charged the shelf price, not the $30 of codes handed over.
  assert.deepEqual(f.merchantUpdates, [{ walletBalance: { decrement: 9.99 } }]);
  assert.equal(f.saved.chargedAmount, 9.99);
  const debit = f.walletRows.find((row: any) => row.type === 'DEBIT');
  assert.equal(debit.amount, 9.99);
});

test('the platform is credited the shelf price for a pack, not the code value', async () => {
  const f = fixture({ walletCurrency: 'USD', balance: 500 });
  f.engineStock([
    { denominationId: 'd10', faceValue: 10, availableCount: 5 },
    { denominationId: 'd20', faceValue: 20, availableCount: 5 },
  ]);
  f.setPreset([
    { denominationId: 'd10', quantity: 1, denomination: { faceValue: 10 } },
    { denominationId: 'd20', quantity: 1, denomination: { faceValue: 20 } },
  ]);
  await f.service.createFulfillment({ ...order, amount: 9.99, variantId: 'v-ess-1m' });
  assert.equal(f.revenueRecords.find((r: any) => r.type === 'CREDIT').amount, 9.99);
});

test('a pack on a PKR wallet is charged the rupee price set for the pack', async () => {
  // "PS Essential: 1 Month" priced at PKR 2,800, delivered as a $10 and a $20
  // code. The pack's own rupee price is charged - not the codes, and not a
  // conversion of its dollar price.
  const f = fixture({ walletCurrency: 'PKR', balance: 67000, prices: { PKR: 2800 } });
  f.engineStock([
    { denominationId: 'd10', faceValue: 10, availableCount: 5 },
    { denominationId: 'd20', faceValue: 20, availableCount: 5 },
  ]);
  f.setPreset([
    { denominationId: 'd10', quantity: 1, denomination: { faceValue: 10 } },
    { denominationId: 'd20', quantity: 1, denomination: { faceValue: 20 } },
  ]);
  await f.service.createFulfillment({ ...order, amount: 9.99, variantId: 'v-ess-1m' });
  assert.deepEqual(f.merchantUpdates, [{ walletBalance: { decrement: 2800 } }]);
  assert.equal(f.saved.chargedAmount, 2800);
});

test('a pack with no rupee price cannot be bought from a rupee wallet', async () => {
  const f = fixture({ walletCurrency: 'PKR', balance: 67000 });
  f.engineStock([
    { denominationId: 'd10', faceValue: 10, availableCount: 5 },
    { denominationId: 'd20', faceValue: 20, availableCount: 5 },
  ]);
  f.setPreset([
    { denominationId: 'd10', quantity: 1, denomination: { faceValue: 10 } },
    { denominationId: 'd20', quantity: 1, denomination: { faceValue: 20 } },
  ]);
  await assert.rejects(
    () => f.service.createFulfillment({ ...order, amount: 9.99, variantId: 'v-ess-1m' }),
    /PKR has no selling price set for this item/,
  );
  assert.deepEqual(f.merchantUpdates, []);
});

test('an amount-matched order still charges the code value it allocated', async () => {
  // No preset: the codes were chosen to match the amount, so the two agree and
  // the shelf-price rule must not touch this path.
  const f = fixture({ walletCurrency: 'USD', balance: 500 });
  await f.service.createFulfillment({ ...order });
  assert.deepEqual(f.merchantUpdates, [{ walletBalance: { decrement: 100 } }]);
});

test('without a preset, a price that matches no combination is still refused', async () => {
  const f = fixture({ walletCurrency: 'USD', balance: 500 });
  f.engineStock([{ denominationId: 'd10', faceValue: 10, availableCount: 5 }]);

  await assert.rejects(
    () => f.service.createFulfillment({ ...order, amount: 9.99 }),
    (error: any) => {
      assert.match(error.response?.message ?? error.message, /9\.99/);
      return true;
    },
  );
  assert.deepEqual(f.merchantUpdates, [], 'no debit for an unfulfillable amount');
});

test('the platform still books USD when the wallet pays a set rupee price', async () => {
  const f = fixture({ walletCurrency: 'PKR', balance: 67000, prices: { PKR: 27500 } });
  await f.service.createFulfillment({ ...order });
  assert.equal(f.revenueRecords.find((r: any) => r.type === 'CREDIT').amount, 100);
});

test('a set price is enforced on the balance check too', async () => {
  // Holds more than the converted figure would need, but less than the price set.
  const f = fixture({ walletCurrency: 'PKR', balance: 27000, prices: { PKR: 27500 } });
  await assert.rejects(
    () => f.service.createFulfillment({ ...order }),
    (error: any) => {
      assert.match(error.response?.message ?? error.message, /PKR holds 27000 of 27500 needed/);
      return true;
    },
  );
  assert.deepEqual(f.merchantUpdates, [], 'no debit may be attempted');
});
