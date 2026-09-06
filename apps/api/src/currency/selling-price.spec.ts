// Run: node -r ts-node/register/transpile-only --test src/currency/selling-price.spec.ts
// A selling price is set per currency; an unset currency is worked out, not lost.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SellingPriceService } from './selling-price.service';

function service(prices: Record<string, number> = {}, rates: Record<string, number> = { USD: 1, PKR: 300 }) {
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
  const currency: any = {
    getRate: async (code: string) => {
      if (rates[code] === undefined) throw new Error(`No exchange rate is set for ${code}`);
      return rates[code];
    },
  };
  const sut = new SellingPriceService(prisma, { log: async (e: any) => audits.push(e) } as any, currency);
  return { sut, rows, audits };
}

const usdBase = { amount: 100, currency: 'USD' };

test('an explicitly set price is used exactly as entered', async () => {
  // The point of the change: a rupee price is what the admin typed, not a
  // dollar price multiplied by a rate.
  const f = service({ PKR: 27500 });
  const price = await f.sut.priceIn('DENOMINATION', 'd1', 'PKR', usdBase);
  assert.deepEqual([price.amount, price.explicit], [27500, true]);
  assert.notEqual(price.amount, 30000, 'must not be the converted figure');
});

test('a currency with no price set is converted rather than left unpriced', async () => {
  const f = service({});
  const price = await f.sut.priceIn('DENOMINATION', 'd1', 'PKR', usdBase);
  assert.deepEqual([price.amount, price.explicit], [30000, false]);
});

test('asking for the price in its own currency returns it unchanged', async () => {
  const f = service({});
  const price = await f.sut.priceIn('DENOMINATION', 'd1', 'USD', usdBase);
  assert.deepEqual([price.amount, price.explicit], [100, false]);
});

test('a non-USD base converts through USD', async () => {
  // A denomination stated in PKR, asked for in USD.
  const f = service({});
  const price = await f.sut.priceIn('DENOMINATION', 'd1', 'USD', { amount: 30000, currency: 'PKR' });
  assert.equal(price.amount, 100);
});

test('both currencies can be set independently and neither disturbs the other', async () => {
  const f = service({});
  await f.sut.setPrice('DENOMINATION', 'd1', 'USD', 100, 'admin-1');
  await f.sut.setPrice('DENOMINATION', 'd1', 'PKR', 27500, 'admin-1');

  assert.equal((await f.sut.priceIn('DENOMINATION', 'd1', 'USD', usdBase)).amount, 100);
  assert.equal((await f.sut.priceIn('DENOMINATION', 'd1', 'PKR', usdBase)).amount, 27500);
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

test('removing a price falls back to conversion instead of unpricing the item', async () => {
  const f = service({ PKR: 27500 });
  await f.sut.removePrice('DENOMINATION', 'd1', 'PKR', 'admin-1');
  const price = await f.sut.priceIn('DENOMINATION', 'd1', 'PKR', usdBase);
  assert.deepEqual([price.amount, price.explicit], [30000, false]);
});

test('a currency with neither a price nor a rate is refused rather than guessed', async () => {
  const f = service({}, { USD: 1 });
  await assert.rejects(
    () => f.sut.priceIn('DENOMINATION', 'd1', 'TRY', usdBase),
    /No exchange rate is set for TRY/,
  );
});

test('variants are priced by the same rules as denominations', async () => {
  const f = service({ PKR: 2500 });
  const price = await f.sut.priceIn('VARIANT', 'v1', 'PKR', { amount: 9.99, currency: 'USD' });
  assert.deepEqual([price.amount, price.explicit], [2500, true]);
});
