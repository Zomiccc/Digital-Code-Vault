// Run: node -r ts-node/register/transpile-only --test src/webhooks/sku-resolution.spec.ts
// An incoming storefront SKU must resolve at whichever level it was set.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebhookService } from './webhook.service';

const psnUsa = { id: 'p-usa', name: 'PSN USA Digital Code', sku: 'PSN-USA', status: 'ACTIVE' };
const retired = { id: 'p-old', name: 'Retired', sku: 'OLD-USA', status: 'DISABLED' };

function resolver(options: {
  products?: any[];
  denominations?: any[];
  variants?: any[];
} = {}) {
  const prisma: any = {
    product: {
      findFirst: async ({ where }: any) =>
        (options.products ?? [psnUsa, retired]).find(
          (row) => row.sku === where.sku && row.status === where.status) ?? null,
    },
    denomination: {
      findFirst: async ({ where }: any) =>
        (options.denominations ?? []).find((row) => row.sku === where.sku) ?? null,
    },
    variant: {
      findFirst: async ({ where }: any) =>
        (options.variants ?? []).find((row) => row.sku === where.sku) ?? null,
    },
  };
  const service = Object.create(WebhookService.prototype);
  service.prisma = prisma;
  service.logger = { log: () => {}, warn: () => {}, error: () => {} };
  return (sku: string) => service.resolveSku(sku);
}

test('a product SKU resolves to the product', async () => {
  const resolve = resolver();
  const result = await resolve('PSN-USA');
  assert.equal(result.product.id, 'p-usa');
  assert.equal(result.matchedOn, 'product SKU');
  assert.equal(result.denominationId, undefined);
  assert.equal(result.variantId, undefined);
});

test('a pack SKU resolves to its variant — the case that was rejected', async () => {
  // PSN-USA-ESS-1M was set on the variant, but matching only read Product.sku,
  // so the order came back "no explicit product mapping found".
  const resolve = resolver({
    variants: [{
      id: 'v-ess-1m', sku: 'PSN-USA-ESS-1M',
      productRegion: { product: psnUsa },
    }],
  });
  const result = await resolve('PSN-USA-ESS-1M');
  assert.equal(result.product.id, 'p-usa');
  assert.equal(result.variantId, 'v-ess-1m', 'the variant selects the delivery rule');
  assert.equal(result.matchedOn, 'pack SKU');
});

test('a stored code-value SKU resolves to that exact denomination', async () => {
  const resolve = resolver({
    denominations: [{ id: 'd-10', sku: 'PSN-USA-10', product: psnUsa }],
  });
  const result = await resolve('PSN-USA-10');
  assert.equal(result.product.id, 'p-usa');
  assert.equal(result.denominationId, 'd-10');
  assert.equal(result.matchedOn, 'code value SKU');
});

test('the product SKU wins when the same code is set at two levels', async () => {
  const resolve = resolver({
    denominations: [{ id: 'd-x', sku: 'PSN-USA', product: psnUsa }],
  });
  assert.equal((await resolve('PSN-USA')).matchedOn, 'product SKU');
});

test('a SKU on an inactive product does not resolve', async () => {
  const resolve = resolver({
    variants: [{
      id: 'v-old', sku: 'OLD-ESS-1M',
      productRegion: { product: retired },
    }],
  });
  assert.equal(await resolve('OLD-ESS-1M'), null);
});

test('an unknown, empty or whitespace SKU resolves to nothing', async () => {
  const resolve = resolver();
  for (const sku of ['NOPE-1', '', '   ']) {
    assert.equal(await resolve(sku), null, `"${sku}" must not match`);
  }
});

test('surrounding whitespace on an incoming SKU is tolerated', async () => {
  const resolve = resolver();
  assert.equal((await resolve('  PSN-USA  ')).product.id, 'p-usa');
});

test('a variant whose product relation is missing is skipped, not crashed on', async () => {
  const resolve = resolver({ variants: [{ id: 'v-orphan', sku: 'ORPHAN', productRegion: null }] });
  assert.equal(await resolve('ORPHAN'), null);
});
