// Run: node -r ts-node/register/transpile-only --test src/products/products.service.spec.ts
// The admin product dropdown depends on listAllProducts, so it must survive a
// catalogue that has no regions and denominations of every shape.
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
}) {
  const regions = options.regions ?? [];
  const prisma: any = {
    product: { findMany: async () => options.products },
    codeItem: { groupBy: async () => [] },
    region: {
      findFirst: async ({ where }: any) => {
        const wanted = where.OR.map((c: any) => c.code ?? c.name);
        return regions.find((r) => wanted.includes(r.code) || wanted.includes(r.name)) ?? null;
      },
    },
  };
  const currency = new CurrencyService(prisma);
  return new ProductsService(prisma, currency, audit());
}

test('products load when no regions are configured at all', async () => {
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

test('a region reports its own currency, and a face value is not converted', async () => {
  // A Lira denomination reads 250 Lira. It used to be multiplied by a rate.
  const sut = service({
    products: [{ id: 'p1', name: 'PSN TR', region: 'TR', denominations: [
      { id: 'd1', faceValue: 250, currency: 'TRY' },
    ] }],
    regions: [{ code: 'TR', name: 'Turkey', currency: 'TRY', symbol: '₺' }],
  });
  const result = await sut.listAllProducts();
  assert.equal(result[0].regional_currency, 'TRY');
  assert.equal(result[0].denominations[0].local_amount, 250);
  assert.equal(result[0].denominations[0].local_formatted, '₺250');
});

test('a dollar denomination in a Lira region still reads in dollars', async () => {
  const sut = service({
    products: [{ id: 'p1', name: 'PSN TR', region: 'TR', denominations: [
      { id: 'd1', faceValue: 10, currency: 'USD' },
    ] }],
    regions: [{ code: 'TR', name: 'Turkey', currency: 'TRY', symbol: '₺' }],
  });
  const result = await sut.listAllProducts();
  assert.equal(result[0].denominations[0].local_currency, 'USD');
  assert.equal(result[0].denominations[0].local_amount, 10);
});

test('an empty catalogue returns an empty list rather than throwing', async () => {
  const sut = service({ products: [] });
  assert.deepEqual(await sut.listAllProducts(), []);
});

test('a currency lookup that throws does not empty the dropdown', async () => {
  const prisma: any = {
    product: { findMany: async () => [
      { id: 'p1', name: 'PSN KSA', region: 'KSA', denominations: [{ id: 'd1', faceValue: 10 }] },
    ] },
    codeItem: { groupBy: async () => [] },
    region: { findFirst: async () => { throw new Error('relation "Region" does not exist'); } },
  };
  const currency = new CurrencyService(prisma);
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

// ─── Deleting a value or a product ───

/**
 * CodeItem cascades from Denomination and Denomination from Product, so an
 * unguarded delete quietly takes stored codes with it. These fixtures count
 * what is in the way and assert nothing is written when something is.
 */
function deleteFixture(counts: {
  codes?: number; ruleItems?: number; orders?: number; connected?: number; exported?: boolean;
} = {}) {
  const deleted: string[] = [];
  const prisma: any = {
    denomination: {
      findUnique: async () => ({ id: 'd1', faceValue: 10, currency: 'USD', product: { name: 'PSN USA' } }),
      findMany: async () => [{ id: 'd1' }],
      delete: async ({ where }: any) => { deleted.push(`denomination:${where.id}`); return {}; },
    },
    product: {
      findUnique: async () => ({ id: 'p1', name: 'PSN USA', region: 'USA' }),
      delete: async ({ where }: any) => { deleted.push(`product:${where.id}`); return {}; },
    },
    variant: { findMany: async () => [] },
    walletTransaction: { updateMany: async () => ({ count: 0 }) },
    auditLog: { findFirst: async () => (counts.exported ? { id: 'a1' } : null) },
    codeItem: { count: async () => counts.codes ?? 0 },
    fulfillmentCombinationItem: { count: async () => counts.ruleItems ?? 0 },
    sellingPrice: { deleteMany: async () => { deleted.push('prices'); return {}; } },
    fulfillmentRequest: {
      count: async () => counts.orders ?? 0,
      findMany: async () => Array.from({ length: counts.orders ?? 0 }, (_, i) => ({ id: `o${i}` })),
      deleteMany: async () => { deleted.push('orders'); return { count: counts.orders ?? 0 }; },
    },
    connectedProduct: {
      count: async () => counts.connected ?? 0,
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  const sut = new ProductsService(prisma, {} as any, audit());
  return { sut, deleted };
}

test('an empty code value is deleted, and its prices go with it', async () => {
  const f = deleteFixture();
  assert.deepEqual(await f.sut.deleteDenomination('d1', 'admin-1'), { id: 'd1', deleted: true });
  assert.deepEqual(f.deleted, ['prices', 'denomination:d1']);
});

test('a value still holding codes is refused, and nothing is written', async () => {
  // The codes cascade, so deleting would erase what customers were sent.
  const f = deleteFixture({ codes: 12 });
  await assert.rejects(() => f.sut.deleteDenomination('d1', 'admin-1'), /still holds 12 code/);
  assert.deepEqual(f.deleted, []);
});

test('a value a delivery rule hands out is refused', async () => {
  const f = deleteFixture({ ruleItems: 2 });
  await assert.rejects(() => f.sut.deleteDenomination('d1', 'admin-1'), /2 delivery rule/);
  assert.deepEqual(f.deleted, []);
});

test('a product with no history is deleted', async () => {
  const f = deleteFixture();
  const result = await f.sut.deleteProduct('p1', 'admin-1');
  assert.deepEqual([result.id, result.deleted, result.orders_removed], ['p1', true, 0]);
  assert.deepEqual(f.deleted, ['prices', 'product:p1']);
});

test('a product with orders is refused rather than erasing what was delivered', async () => {
  const f = deleteFixture({ orders: 7 });
  await assert.rejects(() => f.sut.deleteProduct('p1', 'admin-1'), /7 order\(s\)/);
  assert.deepEqual(f.deleted, []);
});

test('forcing a delete without exporting the codes first is refused', async () => {
  // The export is the only copy of the codes once this runs, so it is checked
  // against the audit trail rather than taken on trust from the screen.
  const f = deleteFixture({ orders: 7, codes: 40, exported: false });
  await assert.rejects(
    () => f.sut.deleteProduct('p1', 'admin-1', undefined, { force: true }),
    /Download the codes/,
  );
  assert.deepEqual(f.deleted, [], 'nothing may be written');
});

test('once the codes are exported, a product with orders can be forced out', async () => {
  const f = deleteFixture({ orders: 7, codes: 40, exported: true });
  const result = await f.sut.deleteProduct('p1', 'admin-1', undefined, { force: true });
  assert.deepEqual(
    [result.deleted, result.orders_removed, result.codes_removed],
    [true, 7, 40],
  );
  // The orders go; the product goes with them. The wallet ledger is detached,
  // never deleted, because it records money and not a product.
  assert.deepEqual(f.deleted, ['prices', 'orders', 'product:p1']);
});

test('a product still holding codes, or linked to a storefront, is refused', async () => {
  const withCodes = deleteFixture({ codes: 3 });
  await assert.rejects(() => withCodes.sut.deleteProduct('p1', 'admin-1'), /3 code\(s\)/);
  assert.deepEqual(withCodes.deleted, []);

  const linked = deleteFixture({ connected: 1 });
  await assert.rejects(() => linked.sut.deleteProduct('p1', 'admin-1'), /1 storefront product/);
  assert.deepEqual(linked.deleted, []);
});

test('deleting something that is not there is reported, not silently ignored', async () => {
  const prisma: any = {
    denomination: { findUnique: async () => null },
    product: { findUnique: async () => null },
  };
  const sut = new ProductsService(prisma, {} as any, audit());
  await assert.rejects(() => sut.deleteDenomination('nope'), /Denomination not found/);
  await assert.rejects(() => sut.deleteProduct('nope'), /Product not found/);
});
