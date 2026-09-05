// Run: node -r ts-node/register/transpile-only --test src/products/products.service.spec.ts
// The admin product dropdown depends on listAllProducts, so it must survive a
// catalogue that has no regions, no rates, and denominations of every shape.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProductsService } from './products.service';
import { CurrencyService } from '../currency/currency.service';

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
  return new ProductsService(prisma, currency);
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
  const sut = new ProductsService(prisma, currency);
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
  const sut = new ProductsService(prisma, currency);
  const result = await sut.listAllProducts();
  assert.equal(result.length, 1, 'products must load even if the region table is unavailable');
  assert.equal(result[0].regional_currency, 'USD');
});
