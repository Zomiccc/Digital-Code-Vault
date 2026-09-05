// Run: node -r ts-node/register/transpile-only --test src/fulfillment/wallet-currency.spec.ts
// A wallet is charged in its own currency while the platform's books stay in USD.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FulfillmentService } from './fulfillment.service';

function fixture(options: { walletCurrency: string; balance: number; rate?: number }) {
  let saved: any;
  let preset: any = null;
  let stock: any[] = [{ denominationId: 'denom100', faceValue: 100, availableCount: 4 }];
  let cached: any;
  const walletRows: any[] = [];
  const revenueRecords: any[] = [];
  const merchantUpdates: any[] = [];
  let platformBalance = 0;
  let rateLookups = 0;
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
    { getRate: async (currency: string) => {
      rateLookups++;
      if (currency === 'USD') return 1;
      if (options.rate === undefined) throw new Error(`No exchange rate is set for ${currency}`);
      return options.rate;
    } } as any,
  );
  return {
    service, walletRows, revenueRecords, merchantUpdates, merchant,
    setPreset: (items: any) => { preset = items; },
    engineStock: (next: any[]) => { stock = next; },
    get platformBalance() { return platformBalance; },
    get saved() { return saved; },
    get rateLookups() { return rateLookups; },
  };
}

const order = {
  merchantId: 'merchant', productId: 'product', amount: 100, currency: 'USD',
  idempotencyKey: 'k', actorType: 'MERCHANT' as const,
};

test('a $100 code on a 300 PKR wallet debits 30,000 PKR, not 100', async () => {
  const f = fixture({ walletCurrency: 'PKR', balance: 67000, rate: 300 });
  const result = await f.service.createFulfillment({ ...order });

  assert.equal(result.status, 'ALLOCATED');
  assert.deepEqual(f.merchantUpdates, [{ walletBalance: { decrement: 30000 } }]);
  assert.equal(Number(f.merchant.walletBalance), 37000, 'PKR 67,000 less PKR 30,000');

  const debit = f.walletRows.find((row) => row.type === 'DEBIT');
  assert.equal(debit.amount, 30000);
  assert.equal(debit.currency, 'PKR');

  // The order keeps the USD face value plus what was actually charged and at what rate.
  assert.equal(Number(f.saved.amount), 100);
  assert.equal(f.saved.chargedCurrency, 'PKR');
  assert.equal(f.saved.chargedAmount, 30000);
  assert.equal(f.saved.fxRate, 300);
});

test('the platform is credited in USD even when the wallet pays PKR', async () => {
  const f = fixture({ walletCurrency: 'PKR', balance: 67000, rate: 300 });
  await f.service.createFulfillment({ ...order });

  const credit = f.revenueRecords.find((r) => r.type === 'CREDIT');
  assert.equal(credit.amount, 100, 'platform revenue stays in USD');
  assert.equal(f.platformBalance, 100);
});

test('a USD wallet is charged the face value with no conversion', async () => {
  const f = fixture({ walletCurrency: 'USD', balance: 500, rate: undefined });
  await f.service.createFulfillment({ ...order });

  assert.deepEqual(f.merchantUpdates, [{ walletBalance: { decrement: 100 } }]);
  const debit = f.walletRows.find((row) => row.type === 'DEBIT');
  assert.equal(debit.amount, 100);
  assert.equal(debit.currency, 'USD');
  assert.equal(f.saved.fxRate, 1);
});

test('the balance check uses the converted amount, so PKR 20,000 cannot buy a $100 code', async () => {
  const f = fixture({ walletCurrency: 'PKR', balance: 20000, rate: 300 });
  // 20,000 exceeds the raw face value of 100 but is short of the 30,000 actually due.
  await assert.rejects(
    () => f.service.createFulfillment({ ...order }),
    (error: any) => {
      assert.match(error.response?.message ?? error.message, /Insufficient wallet balance/);
      assert.match(error.response?.message ?? error.message, /30000 PKR/);
      return true;
    },
  );
  assert.deepEqual(f.merchantUpdates, [], 'no debit may be attempted');
  assert.equal(f.walletRows.length, 0);
  assert.equal(f.platformBalance, 0);
});

test('a wallet currency with no configured rate refuses the order rather than guessing', async () => {
  const f = fixture({ walletCurrency: 'TRY', balance: 100000, rate: undefined });
  await assert.rejects(
    () => f.service.createFulfillment({ ...order }),
    /No exchange rate is set for TRY/,
  );
  assert.deepEqual(f.merchantUpdates, []);
  assert.equal(f.walletRows.length, 0);
});

test('the rate is read once per order so a mid-order change cannot split the charge', async () => {
  const f = fixture({ walletCurrency: 'PKR', balance: 67000, rate: 300 });
  await f.service.createFulfillment({ ...order });
  assert.equal(f.rateLookups, 1);
});

// ─── A pack preset decides what is delivered, and what is charged ───

test('a preset delivers its codes even though they do not add up to the shelf price', async () => {
  // "PS Essential: 1 Month" sells for 9.99 but is delivered as $10 + $20. The
  // order used to be rejected with "no combination exactly sums to 9.99".
  const f = fixture({ walletCurrency: 'USD', balance: 500, rate: undefined });
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
  // Charged the value handed over, not the shelf price.
  assert.deepEqual(f.merchantUpdates, [{ walletBalance: { decrement: 30 } }]);
  assert.equal(f.saved.chargedAmount, 30);
});

test('without a preset, a price that matches no combination is still refused', async () => {
  const f = fixture({ walletCurrency: 'USD', balance: 500, rate: undefined });
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
