// Run: node -r ts-node/register/transpile-only --test src/wallet/merchant-wallet.spec.ts
// A merchant holds one balance per currency; an order is paid from exactly one.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MerchantWalletService } from './merchant-wallet.service';

/** Prices per currency, standing in for what the admin set on the Prices tab. */
function priced(prices: Record<string, number | null>) {
  return async (currency: string) => {
    const value = prices[currency];
    return value === undefined ? null : value;
  };
}

function service(options: {
  wallets: { currency: string; balance: number; spendOrder: number }[];
  rates?: Record<string, number>;
  merchantCurrency?: string;
}) {
  const rates = options.rates ?? { USD: 1, PKR: 300 };
  const rows = options.wallets.map((wallet, index) => ({
    id: `w-${wallet.currency}`, merchantId: 'm1', ...wallet,
    balance: wallet.balance, createdAt: new Date(index), updatedAt: new Date(index),
  }));
  const created: any[] = [];
  const txns: any[] = [];
  const updates: any[] = [];

  const prisma: any = {
    merchant: {
      findUnique: async () => ({ id: 'm1', currency: options.merchantCurrency ?? 'USD' }),
    },
    merchantWallet: {
      findMany: async ({ orderBy }: any) => {
        const sorted = [...rows];
        if (orderBy) {
          sorted.sort((a, b) => a.spendOrder - b.spendOrder || a.currency.localeCompare(b.currency));
        }
        return sorted;
      },
      createMany: async ({ data }: any) => {
        for (const row of data) {
          if (rows.some((existing) => existing.currency === row.currency)) continue;
          created.push(row);
          rows.push({ id: `w-${row.currency}`, ...row, createdAt: new Date(), updatedAt: new Date() });
        }
        return { count: data.length };
      },
      update: async ({ where, data }: any) => {
        const row = rows.find((entry) => entry.currency === where.merchantId_currency.currency);
        if (!row) throw new Error('wallet missing');
        if (data.balance?.increment !== undefined) row.balance += data.balance.increment;
        if (data.spendOrder !== undefined) row.spendOrder = data.spendOrder;
        updates.push({ where, data });
        return row;
      },
    },
    walletTransaction: { create: async ({ data }: any) => { txns.push(data); return data; } },
    $transaction: async (ops: any) => Promise.all(ops),
  };
  const sut = new MerchantWalletService(prisma, { log: async () => {} } as any);
  return { sut, rows, created, txns, updates };
}

test('a merchant gets a USD and a PKR wallet without any setup', async () => {
  const f = service({ wallets: [] });
  const wallets = await f.sut.listWallets('m1');
  assert.deepEqual(wallets.map((w) => w.currency).sort(), ['PKR', 'USD']);
  assert.deepEqual(wallets.map((w) => w.balance), [0, 0]);
});

test("an existing PKR merchant keeps spending PKR first", async () => {
  const f = service({ wallets: [], merchantCurrency: 'PKR' });
  const wallets = await f.sut.listWallets('m1');
  assert.equal(wallets[0].currency, 'PKR', 'their own currency leads');
});

test('the preferred wallet pays the price set in its own currency', async () => {
  // A $100 code sold for $101 and for ₨27,500 costs exactly those amounts.
  // ₨27,500 is deliberately not 101 times a rate.
  const f = service({
    wallets: [
      { currency: 'PKR', balance: 67000, spendOrder: 0 },
      { currency: 'USD', balance: 500, spendOrder: 1 },
    ],
  });
  const { chosen } = await f.sut.chooseWalletForCharge('m1', priced({ USD: 101, PKR: 27500 }));
  assert.equal(chosen!.currency, 'PKR');
  assert.equal(chosen!.amount, 27500, 'the rupee price as entered');
});

test('falling back charges the other currency its own price, not a conversion', async () => {
  const f = service({
    wallets: [
      { currency: 'PKR', balance: 1000, spendOrder: 0 },
      { currency: 'USD', balance: 500, spendOrder: 1 },
    ],
  });
  const { chosen } = await f.sut.chooseWalletForCharge('m1', priced({ USD: 101, PKR: 27500 }));
  assert.equal(chosen!.currency, 'USD');
  assert.equal(chosen!.amount, 101);
});

test('a currency the order cannot be priced in is skipped', async () => {
  const f = service({
    wallets: [
      { currency: 'TRY', balance: 999999, spendOrder: 0 },
      { currency: 'USD', balance: 500, spendOrder: 1 },
    ],
  });
  const { chosen, shortfalls } = await f.sut.chooseWalletForCharge('m1', priced({ USD: 101 }));
  assert.equal(chosen!.currency, 'USD', 'skipped the unpriceable wallet despite its balance');
  assert.equal(shortfalls[0].reason, 'no_price');
});

test('a preferred wallet that cannot cover the order falls back to the other', async () => {
  // The case that decided the design: PKR 1,000 against a PKR 30,000 order.
  const f = service({
    wallets: [
      { currency: 'PKR', balance: 1000, spendOrder: 0 },
      { currency: 'USD', balance: 500, spendOrder: 1 },
    ],
  });
  const { chosen, shortfalls } = await f.sut.chooseWalletForCharge('m1', priced({ USD: 100, PKR: 30000 }));
  assert.equal(chosen!.currency, 'USD');
  assert.equal(chosen!.amount, 100, 'paid in full from USD, not split');
  assert.deepEqual(shortfalls.map((s) => [s.currency, s.required]), [['PKR', 30000]]);
});

test('an order is never split across two wallets', async () => {
  // Together they hold enough; separately neither does. It must fail rather
  // than draw from both.
  const f = service({
    wallets: [
      { currency: 'PKR', balance: 20000, spendOrder: 0 },
      { currency: 'USD', balance: 40, spendOrder: 1 },
    ],
  });
  const { chosen } = await f.sut.chooseWalletForCharge('m1', priced({ USD: 100, PKR: 30000 }));
  assert.equal(chosen, null);
});

test('the shortfall message names what each wallet holds against what is needed', async () => {
  const f = service({
    wallets: [
      { currency: 'PKR', balance: 20000, spendOrder: 0 },
      { currency: 'USD', balance: 40, spendOrder: 1 },
    ],
  });
  const { shortfalls } = await f.sut.chooseWalletForCharge('m1', priced({ USD: 100, PKR: 30000 }));
  const message = f.sut.describeShortfall(shortfalls);
  assert.match(message, /PKR holds 20000 of 30000 needed/);
  assert.match(message, /USD holds 40 of 100 needed/);
});

test('a deposit lands in the currency it was made in', async () => {
  const f = service({
    wallets: [
      { currency: 'USD', balance: 0, spendOrder: 0 },
      { currency: 'PKR', balance: 0, spendOrder: 1 },
    ],
  });
  const result = await f.sut.credit('m1', 'PKR', 67000, { referenceId: 'fr-1' });

  assert.equal(result.balance, 67000);
  assert.equal(f.rows.find((r) => r.currency === 'USD')!.balance, 0, 'USD untouched');
  assert.deepEqual(
    [f.txns[0].type, f.txns[0].amount, f.txns[0].currency],
    ['CREDIT', 67000, 'PKR'],
  );
});

test('a non-positive deposit is refused', async () => {
  const f = service({ wallets: [{ currency: 'USD', balance: 0, spendOrder: 0 }] });
  for (const bad of [0, -5]) {
    await assert.rejects(() => f.sut.credit('m1', 'USD', bad), /greater than zero/);
  }
});

test('naming one preferred currency is enough to reorder', async () => {
  const f = service({
    wallets: [
      { currency: 'USD', balance: 10, spendOrder: 0 },
      { currency: 'PKR', balance: 20, spendOrder: 1 },
    ],
  });
  const wallets = await f.sut.setSpendOrder('m1', ['PKR']);
  assert.deepEqual(wallets.map((w) => w.currency), ['PKR', 'USD']);
});

test('preferring a currency the merchant has no wallet for is refused', async () => {
  const f = service({ wallets: [{ currency: 'USD', balance: 10, spendOrder: 0 }] });
  await assert.rejects(() => f.sut.setSpendOrder('m1', ['TRY']), /No TRY wallet/);
});
