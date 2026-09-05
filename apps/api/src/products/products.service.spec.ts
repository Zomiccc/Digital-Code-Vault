// Run: node -r ts-node/register/transpile-only --test src/products/products.service.spec.ts
// The admin product dropdown depends on listAllProducts, so it must survive a
// catalogue that has no regions, no rates, and denominations of every shape.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProductsService } from './products.service';
import { CurrencyService } from '../currency/currency.service';

/** Audit is only exercised by the price update; elsewhere it must simply exist. */
function audit() {
  return { log: async () => {} } as any;
}

function service(options: {
  products: any[];
  regions?: any[];
  rates?: Record<string, number>;
}) {
  const regions = options.regions ?? [];
  const rates = options.rates ?? {};
  const prisma: any = {
    product: { findMany: async () => options.products },
    codeItem: { groupBy: async () => [] },
    region: {
      findFirst: async ({ where }: any) => {
        const wanted = where.OR.map((c: any) => c.code ?? c.name);
        return regions.find((r) => wanted.includes(r.code) || wanted.includes(r.name)) ?? null;
      },
    },
    exchangeRate: {
      findUnique: async ({ where }: any) =>
        rates[where.currency] === undefined
          ? null
          : { currency: where.currency, unitsPerUsd: rates[where.currency] },
    },
  };
  const currency = new CurrencyService(prisma, { log: async () => {} } as any);
  return new ProductsService(prisma, currency, audit());
}

test('products load when no regions or rates are configured at all', async () => {
  // The common case for a fresh platform: Region rows have never been created.
  const sut = service({
    products: [
      { id: 'p1', name: 'PSN KSA', region: 'KSA', denominations: [{ id: 'd1', faceValue: 10 }] },
      { id: 'p2', name: 'Steam', region: 'USA', denominations: [] },
    ],
  });
  const result = await sut.listAllProducts();
  assert.equal(result.length, 2);
  assert.equal(result[0].regional_currency, 'USD');
  assert.equal(result[0].denominations[0].local_amount, 10);
});

test('a product with a null or missing region still loads', async () => {
  const sut = service({
    products: [
      { id: 'p1', name: 'No region', region: null, denominations: [{ id: 'd1', faceValue: 5 }] },
      { id: 'p2', name: 'Undefined region', denominations: [{ id: 'd2', faceValue: 5 }] },
    ],
  });
  const result = await sut.listAllProducts();
  assert.equal(result.length, 2);
  assert.equal(result[0].regional_currency, 'USD');
  assert.equal(result[1].regional_currency, 'USD');
});

test('a denomination with a null or missing face value does not take down the whole list', async () => {
  const sut = service({
    products: [{ id: 'p1', name: 'Odd', region: 'KSA', denominations: [
      { id: 'd1', faceValue: null },
      { id: 'd2' },
      { id: 'd3', faceValue: 'not-a-number' },
    ] }],
  });
  const result = await sut.listAllProducts();
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].denominations.map((d: any) => d.local_amount), [0, 0, 0]);
});

test('regional prices appear once a region and its rate exist', async () => {
  const sut = service({
    products: [{ id: 'p1', name: 'PSN TR', region: 'TR', denominations: [{ id: 'd1', faceValue: 100 }] }],
    regions: [{ code: 'TR', name: 'Turkey', currency: 'TRY', symbol: '₺' }],
    rates: { TRY: 34.2 },
  });
  const result = await sut.listAllProducts();
  assert.equal(result[0].regional_currency, 'TRY');
  assert.equal(result[0].denominations[0].local_amount, 3420);
});

test('a region configured for a currency with no rate still lists its products', async () => {
  const sut = service({
    products: [{ id: 'p1', name: 'PSN BR', region: 'BR', denominations: [{ id: 'd1', faceValue: 100 }] }],
    regions: [{ code: 'BR', name: 'Brazil', currency: 'BRL', symbol: 'R$' }],
    rates: {},
  });
  const result = await sut.listAllProducts();
  assert.equal(result.length, 1, 'a missing rate must not empty the product list');
  assert.equal(result[0].regional_currency, 'USD');
});

test('an empty catalogue returns an empty list rather than throwing', async () => {
  const sut = service({ products: [] });
  assert.deepEqual(await sut.listAllProducts(), []);
});

test('a Prisma client without the ExchangeRate model must not empty the dropdown', async () => {
  // Reproduces a stale generated client in production: the model the currency
  // lookup needs simply is not there. The product list must still load.
  const prisma: any = {
    product: { findMany: async () => [
      { id: 'p1', name: 'PSN KSA', region: 'KSA', denominations: [{ id: 'd1', faceValue: 10 }] },
    ] },
    codeItem: { groupBy: async () => [] },
    region: { findFirst: async () => ({ code: 'KSA', name: 'Saudi', currency: 'SAR', symbol: 'SR' }) },
    // exchangeRate intentionally absent
  };
  const currency = new CurrencyService(prisma, { log: async () => {} } as any);
  const sut = new ProductsService(prisma, currency, audit());
  const result = await sut.listAllProducts();
  assert.equal(result.length, 1, 'products must load even if currency lookup fails');
});

test('a currency lookup that throws does not empty the dropdown', async () => {
  const prisma: any = {
    product: { findMany: async () => [
      { id: 'p1', name: 'PSN KSA', region: 'KSA', denominations: [{ id: 'd1', faceValue: 10 }] },
    ] },
    codeItem: { groupBy: async () => [] },
    region: { findFirst: async () => { throw new Error('relation "Region" does not exist'); } },
  };
  const currency = new CurrencyService(prisma, { log: async () => {} } as any);
  const sut = new ProductsService(prisma, currency, audit());
  const result = await sut.listAllProducts();
  assert.equal(result.length, 1, 'products must load even if the region table is unavailable');
  assert.equal(result[0].regional_currency, 'USD');
});

// ─── Changing what a code value is worth ───

function priceFixture(existing: any[], target: any) {
  const audits: any[] = [];
  const updates: any[] = [];
  const prisma: any = {
    denomination: {
      findUnique: async () => target,
      findFirst: async ({ where }: any) =>
        existing.find((row) =>
          row.id !== where.id.not &&
          row.productId === where.productId &&
          Number(row.faceValue) === Number(where.faceValue) &&
          row.currency === where.currency) ?? null,
      update: async ({ data }: any) => {
        updates.push(data);
        return { ...target, ...data };
      },
    },
  };
  const sut = new ProductsService(
    prisma, {} as any, { log: async (event: any) => audits.push(event) } as any,
  );
  return { sut, audits, updates };
}

const saudi50 = { id: 'd1', productId: 'p1', faceValue: 50, currency: 'USD' };

test('a code value can be repriced into the region currency', async () => {
  const f = priceFixture([saudi50], saudi50);
  const result = await f.sut.updateDenomination('d1', { faceValue: 187.5, currency: 'SAR' }, 'admin-1');

  assert.deepEqual(result, { id: 'd1', face_value: 187.5, currency: 'SAR' });
  assert.deepEqual(f.updates, [{ faceValue: 187.5, currency: 'SAR' }]);
  assert.equal(f.audits[0].action, 'denomination.update_price');
  assert.deepEqual(f.audits[0].metadata.from, { faceValue: 50, currency: 'USD' });
});

test('changing only the currency keeps the amount', async () => {
  const f = priceFixture([saudi50], saudi50);
  await f.sut.updateDenomination('d1', { currency: 'SAR' }, 'admin-1');
  assert.deepEqual(f.updates, [{ faceValue: 50, currency: 'SAR' }]);
});

test('a currency code is normalised to upper case', async () => {
  const f = priceFixture([saudi50], saudi50);
  await f.sut.updateDenomination('d1', { currency: 'sar' }, 'admin-1');
  assert.equal(f.updates[0].currency, 'SAR');
});

test('a value colliding with another on the same product is refused', async () => {
  const other = { id: 'd2', productId: 'p1', faceValue: 100, currency: 'USD' };
  const f = priceFixture([saudi50, other], saudi50);
  await assert.rejects(
    () => f.sut.updateDenomination('d1', { faceValue: 100 }, 'admin-1'),
    /already has a USD 100 value/,
  );
  assert.deepEqual(f.updates, [], 'nothing may be written');
});

test('a nonsensical value or currency is refused before writing', async () => {
  for (const bad of [
    { faceValue: 0 },
    { faceValue: -5 },
    { faceValue: NaN },
    { faceValue: 10.005 },
    { currency: 'SARS' },
    { currency: 'S' },
  ]) {
    const f = priceFixture([saudi50], saudi50);
    await assert.rejects(() => f.sut.updateDenomination('d1', bad as any, 'admin-1'));
    assert.deepEqual(f.updates, [], `must not write for ${JSON.stringify(bad)}`);
  }
});

test('an unknown denomination is reported rather than created', async () => {
  const f = priceFixture([], null);
  await assert.rejects(
    () => f.sut.updateDenomination('missing', { faceValue: 10 }, 'admin-1'),
    /Denomination not found/,
  );
});
