// Run: node -r ts-node/register/transpile-only --test src/fulfillment/manual-order-discount.spec.ts
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manualOrderPricing } from './manual-order-pricing';
import { FulfillmentService } from './fulfillment.service';
import { AdminController } from '../admin/admin.controller';
import { AdminService } from '../admin/admin.service';

function fixture() {
  let saved: any;
  let cached: any;
  let reservations = 0;
  let reserved: any;
  const audits: any[] = [];
  const revenueRecords: any[] = [];
  let platformBalance = 0;
  let transactionActive = false;
  let transactionTail = Promise.resolve();
  let reversals = 0;
  let walletLookups = 0;
  const merchant = { id: 'platform', name: 'Platform', status: 'ACTIVE', allowedProductIds: '[]', walletBalance: 0 };
  const prisma: any = {
    platformSetting: { findUnique: async () => null },
    merchant: { findUnique: async () => merchant },
    product: { findUnique: async () => ({ id: 'product', name: 'Code', status: 'ACTIVE', productType: 'NORMAL' }) },
    fulfillmentRequest: {
      findUnique: async () => saved,
      create: async ({ data }: any) => saved = { ...data, id: 'order', createdAt: new Date(), allocations: [] },
      update: async ({ data }: any) => saved = { ...saved, ...data },
      updateMany: async ({ where, data }: any) => {
        assert.ok(transactionActive, 'reversal claim must run inside transaction');
        if (saved?.id !== where.id || saved?.status !== where.status) return { count: 0 };
        saved = { ...saved, ...data };
        return { count: 1 };
      },
      findMany: async () => [{ ...saved, merchant, product: { name: 'Code' } }],
      count: async () => 1,
    },
    idempotencyRecord: {
      findUnique: async () => cached,
      create: async ({ data }: any) => cached = data,
    },
    deliveryToken: { create: async () => ({}) },
    adminWallet: { update: async ({ data }: any) => {
      platformBalance += data.balance.increment ?? -data.balance.decrement;
      return { balance: platformBalance };
    } },
    adminWalletTransaction: {
      create: async ({ data }: any) => { revenueRecords.push(data); return data; },
      findFirst: async () => revenueRecords.find(r => r.type === 'CREDIT'),
    },
    // Serialize transaction writes like contending database row locks, while
    // allowing both callers' pre-transaction reads to see the same old status.
    $transaction: async (callback: any) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      const snapshot = { saved, platformBalance, records: revenueRecords.length };
      transactionActive = true;
      try {
        return await callback(prisma);
      } catch (error) {
        saved = snapshot.saved;
        platformBalance = snapshot.platformBalance;
        revenueRecords.length = snapshot.records;
        throw error;
      } finally {
        transactionActive = false;
        release();
      }
    },
  };
  // No merchant wallet mutation mocks: an accidental merchant debit/refund fails.
  const engine: any = {
    getAvailableStock: async () => [{ denominationId: 'denom50', faceValue: 50, availableCount: 4 }],
    findBestCombination: (_stock: any, amount: number) => amount === 100
      ? [{ denominationId: 'denom50', faceValue: 50, count: 2 }] : null,
    reserveCodes: async (_tx: any, _id: any, combination: any) => {
      reservations++;
      reserved = combination;
      return [{ codeItemIds: combination[0].count === 2 ? ['code1', 'code2'] : ['code1'] }];
    },
    confirmAllocation: async () => {},
    reverseAllocation: async () => { reversals++; },
  };
  const service = new FulfillmentService(
    prisma, { get: (_key: string, fallback: any) => fallback } as any,
    { generateToken: () => 'token', hashToken: () => 'hash' } as any,
    { log: async (event: any) => audits.push(event) } as any, engine,
    { queueWebhookEvent: async () => {} } as any, {} as any, {} as any,
    { getOrCreateAdminWallet: async () => {
      assert.equal(transactionActive, false, 'root wallet lookup must not run inside transaction');
      walletLookups++;
      return 'admin-wallet';
    } } as any,
    // An admin order skips the wallet, so no rate should ever be requested here.
    { getRate: async () => { throw new Error('admin orders must not consult a rate'); } } as any,
    // Likewise nothing should be priced against, or charged to, a merchant wallet.
    { priceIn: async () => { throw new Error('admin orders must not price a wallet'); } } as any,
    {
      chooseWalletForCharge: async () => { throw new Error('admin orders must not choose a wallet'); },
      describeShortfall: () => 'unused',
    } as any,
  );
  return { service, prisma, engine, audits, revenueRecords, get reversals() { return reversals; }, get walletLookups() { return walletLookups; }, get platformBalance() { return platformBalance; }, get saved() { return saved; }, get reserved() { return reserved; }, get reservations() { return reservations; }, clearCache() { cached = undefined; } };
}

const params = { merchantId: 'platform', productId: 'product', amount: 50, currency: 'USD', idempotencyKey: 'manual-test', actorType: 'ADMIN' as const };

test('concurrent reversals with the same stale status debit revenue only once', async () => {
  const f = fixture();
  await f.service.createFulfillment({ ...params, chargeAmount: 40 });
  const snapshot = f.saved;
  let reads = 0;
  let release!: () => void;
  const bothRead = new Promise<void>(resolve => { release = resolve; });
  f.prisma.fulfillmentRequest.findUnique = async () => {
    if (++reads === 2) release();
    await bothRead;
    return snapshot;
  };
  const results = await Promise.allSettled([
    f.service.reverseFulfillment('order', 'admin1'),
    f.service.reverseFulfillment('order', 'admin2'),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.getStatus(), 409);
  assert.equal(f.reversals, 1);
  assert.equal(f.platformBalance, 0);
  assert.equal(f.revenueRecords.filter(r => r.source === 'REFUND').length, 1);
  assert.equal(f.audits.filter(r => r.action === 'fulfillment.reversed').length, 1);
});

test('delivery status changed after precheck prevents reversal side effects', async () => {
  const f = fixture();
  await f.service.createFulfillment({ ...params, chargeAmount: 40 });
  const snapshot = f.saved;
  f.prisma.fulfillmentRequest.findUnique = async () => {
    await f.prisma.fulfillmentRequest.update({ data: { status: 'DELIVERED' } });
    return snapshot;
  };
  await assert.rejects(f.service.reverseFulfillment('order', 'admin'), /status changed/);
  assert.equal(f.saved.status, 'DELIVERED');
  assert.equal(f.reversals, 0);
  assert.equal(f.platformBalance, 40);
  assert.equal(f.revenueRecords.length, 1);
});

test('ledger failure rolls back reversal claim and balance so retry can succeed', async () => {
  const f = fixture();
  await f.service.createFulfillment({ ...params, chargeAmount: 40 });
  const createRecord = f.prisma.adminWalletTransaction.create;
  f.prisma.adminWalletTransaction.create = async () => { throw new Error('ledger unavailable'); };
  await assert.rejects(f.service.reverseFulfillment('order', 'admin'), /ledger unavailable/);
  assert.equal(f.saved.status, 'ALLOCATED');
  assert.equal(f.platformBalance, 40);
  assert.equal(f.revenueRecords.length, 1);
  assert.equal(f.audits.filter(r => r.action === 'fulfillment.reversed').length, 0);
  f.prisma.adminWalletTransaction.create = createRecord;
  await f.service.reverseFulfillment('order', 'admin');
  assert.equal(f.saved.status, 'REVERSED');
  assert.equal(f.platformBalance, 0);
  assert.equal(f.revenueRecords.length, 2);
});

test('manual revenue resolves root wallet connection before transaction entry', async () => {
  const f = fixture();
  await f.service.createFulfillment({ ...params, chargeAmount: 40 });
  assert.equal(f.walletLookups, 1);
  await f.service.reverseFulfillment('order', 'admin');
  assert.equal(f.walletLookups, 1, 'manual reversal uses the original credit wallet');
});

test('an omitted charge means charge in full; a charge implies its discount', () => {
  assert.deepEqual(manualOrderPricing(50), {
    original_amount: 50, charge_amount: 50, discount_amount: 0, net_amount: 50,
  });
  // The headline case: an 80 order charged at 77 shows a discount of 3.
  assert.deepEqual(manualOrderPricing(80, 77), {
    original_amount: 80, charge_amount: 77, discount_amount: 3, net_amount: 77,
  });
  assert.equal(manualOrderPricing(50, 50).discount_amount, 0);
  assert.equal(manualOrderPricing(0.3, 0.1).discount_amount, 0.2);
  assert.equal(manualOrderPricing(50, 0).discount_amount, 50, 'charging nothing is a full discount');
});

test('rejects coercion, non-finite values, negatives, excess precision and a charge above the order', () => {
  for (const charge of [null, '', '5', true, {}, NaN, Infinity, -1, 50.01, 0.001]) {
    assert.throws(() => manualOrderPricing(50, charge));
  }
  for (const amount of [undefined, null, '', '50', false, NaN, Infinity, 0, -1, 1.001, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => manualOrderPricing(amount));
  }
});

// [what the admin charges, the discount that implies on a 50 order]
for (const [chargeAmount, discountAmount] of [
  [undefined, 0], [50, 0], [42.75, 7.25], [0, 50],
] as [number | undefined, number][]) {
  test(`admin charging ${chargeAmount}: shows a ${discountAmount} discount, preserves allocation, skips merchant wallet`, async () => {
    const f = fixture();
    const result = await f.service.createFulfillment({ ...params, chargeAmount });
    assert.equal(f.saved.amount, 50);
    assert.equal(f.saved.discountAmount, discountAmount, 'the discount is derived from the charge');
    assert.equal(f.saved.walletCharged, false);
    assert.deepEqual(f.reserved, [{ denominationId: 'denom50', faceValue: 50, count: 1 }]);
    assert.equal(result.net_amount, chargeAmount ?? 50);
    assert.equal(result.charge_amount, chargeAmount ?? 50);
    assert.equal(f.platformBalance, result.net_amount);
    assert.equal(f.revenueRecords[0].amount, result.net_amount);
    assert.equal(f.revenueRecords[0].source, 'FULFILLMENT');
    assert.equal(f.audits[0].metadata.pricing.discount_amount, discountAmount);
    assert.deepEqual(await f.service.createFulfillment({ ...params, chargeAmount }), result);
    assert.equal(f.reservations, 1);
    f.clearCache();
    const replay = await f.service.createFulfillment({ ...params, chargeAmount });
    assert.equal(replay.net_amount, result.net_amount);
    assert.equal(f.reservations, 1);
    const list = await AdminService.prototype.listAllFulfillmentRequests.call({ prisma: f.prisma } as any);
    assert.equal(list.items[0].discountAmount, discountAmount);
    assert.equal(list.items[0].netAmount, result.net_amount);
    assert.equal(f.revenueRecords.length, 1);
    await f.service.reverseFulfillment('order', 'admin');
    assert.equal(f.platformBalance, 0);
    assert.equal(f.revenueRecords[1].amount, result.net_amount);
    assert.equal(f.revenueRecords[1].source, 'REFUND');
    assert.equal(f.saved.status, 'REVERSED');
  });
}

test('discount does not reduce a multi-code allocation', async () => {
  const f = fixture();
  const result = await f.service.createFulfillment({ ...params, amount: 100, chargeAmount: 50 });
  assert.deepEqual(f.reserved, [{ denominationId: 'denom50', faceValue: 50, count: 2 }]);
  assert.equal(result.net_amount, 50);
  assert.equal(f.saved.amount, 100);
});

test('sandbox manual order records no platform revenue', async () => {
  const f = fixture();
  await f.service.createFulfillment({ ...params, sandbox: true, chargeAmount: 40 });
  assert.equal(f.revenueRecords.length, 0);
  await f.service.reverseFulfillment('order', 'admin');
  assert.equal(f.revenueRecords.length, 0);
});

test('variant preset keeps its denomination quantities when discounted', async () => {
  const f = fixture();
  f.prisma.fulfillmentCombination = { findMany: async () => [{
    name: 'Two codes', items: [{ denominationId: 'denom50', quantity: 2, denomination: { faceValue: 50 } }],
  }] };
  const result = await f.service.createFulfillment({ ...params, amount: 100, variantId: 'variant', chargeAmount: 75 });
  assert.equal(result.net_amount, 75);
  assert.deepEqual(f.reserved, [{ denominationId: 'denom50', faceValue: 50, count: 2 }]);
  assert.equal(f.platformBalance, 75);
});

test('unavailable stock creates no revenue or allocation', async () => {
  const f = fixture();
  f.engine.getAvailableStock = async () => [];
  await assert.rejects(f.service.createFulfillment({ ...params, chargeAmount: 40 }), /No available stock/);
  assert.equal(f.reservations, 0);
  assert.equal(f.revenueRecords.length, 0);
  assert.equal(f.platformBalance, 0);
});

test('rejects non-admin discounts and invalid admin discounts before database access', async () => {
  const f = fixture();
  f.prisma.merchant.findUnique = async () => { throw new Error('Unexpected database access'); };
  await assert.rejects(f.service.createFulfillment({ ...params, actorType: 'MERCHANT', chargeAmount: 45 }), /only available to admins/);
  await assert.rejects(f.service.createFulfillment({ ...params, chargeAmount: 51 }), /chargeAmount/);
  assert.equal(f.reservations, 0);
});

test('controller validates before creating a platform merchant and forwards original amount', async () => {
  const calls: any[] = [];
  const context: any = {
    prisma: { merchant: { findUnique: async () => ({ id: 'platform' }) } },
    fulfillmentService: { createFulfillment: async (input: any) => { calls.push(input); return input; } },
  };
  await AdminController.prototype.createManualOrder.call(context, { productId: 'product', amount: 50, chargeAmount: 40 }, { id: 'admin-id' }, { ip: '127.0.0.1' });
  assert.equal(calls[0].amount, 50);
  assert.equal(calls[0].chargeAmount, 40);
  assert.equal(calls[0].actorType, 'ADMIN');
  context.prisma.merchant.findUnique = async () => { throw new Error('Unexpected database access'); };
  await assert.rejects(AdminController.prototype.createManualOrder.call(context, { productId: 'product', amount: 50, chargeAmount: -1 }, { id: 'admin-id' }, {}), /chargeAmount/);
});

test('a rupee charge is judged against the order value in rupees, not in dollars', () => {
  // Charging 2,800 rupees against a $10 order was refused as "more than the
  // order value" because 2800 was compared with 10. At 300 to the dollar the
  // order is 3,000 rupees, so 2,800 is a 200-rupee discount.
  const orderValueInRupees = 10 * 300;
  assert.deepEqual(manualOrderPricing(orderValueInRupees, 2800), {
    original_amount: 3000, charge_amount: 2800, discount_amount: 200, net_amount: 2800,
  });
});

test('a charge above the order value is still refused, in either currency', () => {
  assert.throws(() => manualOrderPricing(3000, 3001));
  assert.throws(() => manualOrderPricing(10, 10.01));
});
