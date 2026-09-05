// Run: node -r ts-node/register/transpile-only --test src/merchants/currency-change.spec.ts
// Switching a wallet's currency must convert what it holds, not just relabel it.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MerchantsService } from './merchants.service';

function fixture(options: { currency: string; balance: number; rows?: any[] }) {
  const merchant = { id: 'm1', currency: options.currency, walletBalance: options.balance };
  const rows = (options.rows ?? []).map((row) => ({ ...row }));
  const created: any[] = [];
  const audits: any[] = [];
  const prisma: any = {
    merchant: {
      findUnique: async () => merchant,
      update: async ({ data }: any) => Object.assign(merchant, data),
    },
    walletTransaction: {
      findMany: async () => rows,
      update: async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id);
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }: any) => { created.push(data); return data; },
    },
    $transaction: async (callback: any) => callback(prisma),
  };
  const rates: Record<string, number> = { USD: 1, PKR: 300, TRY: 34.2 };
  const currency: any = {
    getRate: async (code: string) => {
      if (rates[code] === undefined) throw new Error(`No exchange rate is set for ${code}`);
      return rates[code];
    },
  };
  const sut = new MerchantsService(
    prisma, {} as any, {} as any, {} as any, {} as any, currency,
    { log: async (event: any) => audits.push(event) } as any,
  );
  return { sut, merchant, rows, created, audits };
}

test('USD 100 becomes PKR 30,000 at a rate of 300', async () => {
  const f = fixture({ currency: 'USD', balance: 100 });
  const result = await f.sut.updateMerchantCurrency('m1', 'PKR', 'admin-1');

  assert.equal(result.converted, true);
  assert.equal(result.balance_before, 100);
  assert.equal(result.balance_after, 30000);
  assert.equal(Number(f.merchant.walletBalance), 30000);
  assert.equal(f.merchant.currency, 'PKR');
});

test('past deposits and spend are restated so the totals still add up', async () => {
  const f = fixture({
    currency: 'USD',
    balance: 100,
    rows: [
      { id: 't1', type: 'CREDIT', amount: 250, balanceAfter: 250, currency: 'USD' },
      { id: 't2', type: 'DEBIT', amount: 150, balanceAfter: 100, currency: 'USD' },
    ],
  });
  await f.sut.updateMerchantCurrency('m1', 'PKR', 'admin-1');

  assert.deepEqual(
    f.rows.map((row) => [row.amount, row.balanceAfter, row.currency]),
    [[75000, 75000, 'PKR'], [45000, 30000, 'PKR']],
  );
});

test('the switch is recorded as a conversion row for traceability', async () => {
  const f = fixture({ currency: 'USD', balance: 100 });
  await f.sut.updateMerchantCurrency('m1', 'PKR', 'admin-1');

  const conversion = f.created.find((row) => row.type === 'CONVERSION');
  assert.ok(conversion, 'a CONVERSION row must be written');
  assert.equal(conversion.currency, 'PKR');
  assert.equal(conversion.balanceAfter, 30000);
  assert.equal(f.audits[0].action, 'merchant.currency_change');
  assert.equal(f.audits[0].metadata.factor, 300);
});

test('converting back returns the original amount', async () => {
  const f = fixture({ currency: 'PKR', balance: 30000 });
  const result = await f.sut.updateMerchantCurrency('m1', 'USD', 'admin-1');
  assert.equal(result.balance_after, 100);
});

test('a non-USD pair converts through USD without needing a direct rate', async () => {
  // PKR 30,000 is USD 100, which is TRY 3,420.
  const f = fixture({ currency: 'PKR', balance: 30000 });
  const result = await f.sut.updateMerchantCurrency('m1', 'TRY', 'admin-1');
  assert.equal(result.balance_after, 3420);
});

test('switching to the same currency changes nothing', async () => {
  const f = fixture({ currency: 'PKR', balance: 30000, rows: [{ id: 't1', amount: 5, balanceAfter: 5, currency: 'PKR' }] });
  const result = await f.sut.updateMerchantCurrency('m1', 'PKR', 'admin-1');
  assert.equal(result.converted, false);
  assert.equal(Number(f.merchant.walletBalance), 30000);
  assert.equal(f.created.length, 0, 'no conversion row for a no-op');
});

test('a currency with no configured rate is refused rather than guessed', async () => {
  const f = fixture({ currency: 'USD', balance: 100 });
  await assert.rejects(
    () => f.sut.updateMerchantCurrency('m1', 'BRL', 'admin-1'),
    /No exchange rate is set for BRL/,
  );
  assert.equal(Number(f.merchant.walletBalance), 100, 'balance must be untouched');
  assert.equal(f.merchant.currency, 'USD');
});

test('rows already in another currency are left alone', async () => {
  const f = fixture({
    currency: 'USD',
    balance: 10,
    rows: [{ id: 't1', amount: 500, balanceAfter: 500, currency: 'PKR' }],
  });
  await f.sut.updateMerchantCurrency('m1', 'PKR', 'admin-1');
  assert.deepEqual([f.rows[0].amount, f.rows[0].currency], [500, 'PKR'], 'already PKR, not re-multiplied');
});
