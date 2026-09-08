// Run: node -r ts-node/register/transpile-only --test src/currency/selling-price.spec.ts
// A selling price is set per currency. An unset currency is unpriced, not guessed.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SellingPriceService } from './selling-price.service';

function service(prices: Record<string, number> = {}) {
  const rows = { ...prices };
  const audits: any[] = [];
  const prisma: any = {
    sellingPrice: {
      findUnique: async ({ where }: any) => {
        const key = where.itemType_itemId_currency.currency;
        return rows[key] === undefined ? null : { currency: key, amount: rows[key] };
      },
      findMany: async () =>
        Object.entries(rows).map(([currency, amount]) => ({
          itemId: 'd1', currency, amount, updatedAt: new Date(0),
        })),
      upsert: async ({ where, create, update }: any) => {
        const key = where.itemType_itemId_currency.currency;
        rows[key] = update.amount ?? create.amount;
        return { currency: key, amount: rows[key] };
      },
      delete: async ({ where }: any) => {
        delete rows[where.itemType_itemId_currency.currency];
        return {};
      },
    },
  };
  const sut = new SellingPriceService(prisma, { log: async (e: any) => audits.push(e) } as any);
  return { sut, rows, audits };
}

const usdBase = { amount: 100, currency: 'USD' };

test('an explicitly set price is used exactly as entered', async () => {
  // A rupee price is what the admin typed, never a dollar price multiplied out.
  const f = service({ PKR: 27500 });
  const price = await f.sut.priceIn('DENOMINATION', 'd1', 'PKR', usdBase);
  assert.deepEqual([price!.amount, price!.explicit], [27500, true]);
  assert.notEqual(price!.amount, 30000, 'must not be a converted figure');
});

test('a currency with no price set is unpriced rather than converted', async () => {
  // With exchange rates gone, there is nothing to fall back on: the item is
  // simply not sold in that currency until an admin prices it.
  const f = service({});
  assert.equal(await f.sut.priceIn('DENOMINATION', 'd1', 'PKR', usdBase), null);
});

test('asking for the price in its own currency returns it unchanged', async () => {
  const f = service({});
  const price = await f.sut.priceIn('DENOMINATION', 'd1', 'USD', usdBase);
  assert.deepEqual([price!.amount, price!.explicit], [100, false]);
});

test('a Lira denomination is priced in Lira without any rate', async () => {
  const f = service({});
  const price = await f.sut.priceIn('DENOMINATION', 'd1', 'TRY', { amount: 250, currency: 'TRY' });
  assert.deepEqual([price!.amount, price!.currency], [250, 'TRY']);
});

test('a dollar price is not derived from a rupee one', async () => {
  const f = service({});
  assert.equal(
    await f.sut.priceIn('DENOMINATION', 'd1', 'USD', { amount: 30000, currency: 'PKR' }),
    null,
  );
});

test('both currencies can be set independently and neither disturbs the other', async () => {
  const f = service({});
  await f.sut.setPrice('DENOMINATION', 'd1', 'USD', 100, 'admin-1');
  await f.sut.setPrice('DENOMINATION', 'd1', 'PKR', 27500, 'admin-1');

  assert.equal((await f.sut.priceIn('DENOMINATION', 'd1', 'USD', usdBase))!.amount, 100);
  assert.equal((await f.sut.priceIn('DENOMINATION', 'd1', 'PKR', usdBase))!.amount, 27500);
});

test('a price is normalised and audited when set', async () => {
  const f = service({ PKR: 20000 });
  await f.sut.setPrice('DENOMINATION', 'd1', 'pkr', 27500, 'admin-1');
  assert.equal(f.rows.PKR, 27500);
  assert.equal(f.audits[0].action, 'price.set');
  assert.deepEqual([f.audits[0].metadata.from, f.audits[0].metadata.to], [20000, 27500]);
});

test('a nonsensical price is refused', async () => {
  const f = service({});
  for (const bad of [0, -1, Number.NaN, 10.005]) {
    await assert.rejects(() => f.sut.setPrice('DENOMINATION', 'd1', 'PKR', bad, 'admin-1'));
  }
});

test('removing a price unprices that currency and leaves the others alone', async () => {
  const f = service({ USD: 100, PKR: 27500 });
  await f.sut.removePrice('DENOMINATION', 'd1', 'PKR', 'admin-1');
  assert.equal(await f.sut.priceIn('DENOMINATION', 'd1', 'PKR', usdBase), null);
  assert.equal((await f.sut.priceIn('DENOMINATION', 'd1', 'USD', usdBase))!.amount, 100);
});

test('variants are priced by the same rules as denominations', async () => {
  const f = service({ PKR: 2500 });
  const price = await f.sut.priceIn('VARIANT', 'v1', 'PKR', { amount: 9.99, currency: 'USD' });
  assert.deepEqual([price!.amount, price!.explicit], [2500, true]);
  const unpriced = service({});
  assert.equal(
    await unpriced.sut.priceIn('VARIANT', 'v1', 'PKR', { amount: 9.99, currency: 'USD' }),
    null,
  );
});
