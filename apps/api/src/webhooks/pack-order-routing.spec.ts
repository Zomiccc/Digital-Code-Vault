// Run: node -r ts-node/register/transpile-only --test src/webhooks/pack-order-routing.spec.ts
//
// A pack order must reach fulfillment as a variant, so its delivery rule picks
// the codes. This is the path that produced two $25 codes for a 9.99 pack set to
// send $10 + $20: the SKU resolved fine on the first order, which auto-wrote a
// product-only Connected Product mapping, and every order after that took the
// mapping, arrived with no variant, and guessed denominations from the amount.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebhookService } from './webhook.service';

const product = { id: 'p-usa', name: 'PSN USA Digital Code', sku: 'PSN-USA', status: 'ACTIVE' };
const variant = {
  id: 'v-ess-1m', name: 'PS Essential: 1 Month', sku: 'PSN-USA-ESS-1M',
  customerPrice: 9.99, currency: 'USD',
  productRegion: { product },
};

/**
 * Drives only the resolution and pricing decisions, by stubbing what the service
 * reads. `mapping` is the Connected Product row the merchant already has.
 */
function scenario(mapping: any) {
  const sut: any = Object.create(WebhookService.prototype);
  sut.logger = { log: () => {}, warn: () => {}, error: () => {} };
  sut.prisma = {
    product: {
      findFirst: async ({ where }: any) =>
        where.sku === product.sku && where.status === 'ACTIVE' ? product : null,
      findUnique: async ({ where }: any) => (where.id === product.id ? product : null),
    },
    denomination: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [
        { id: 'd10', faceValue: 10 }, { id: 'd20', faceValue: 20 }, { id: 'd25', faceValue: 25 },
      ],
    },
    variant: {
      findFirst: async ({ where }: any) => (where.sku === variant.sku ? variant : null),
      findUnique: async ({ where }: any) => (where.id === variant.id ? variant : null),
    },
    connectedProduct: { update: async () => ({}) },
  };
  return { sut, mapping };
}

/** Mirrors the service's own order of decisions for a single-item webhook. */
async function route(sut: any, cpMapping: any, searchSku: string, orderQuantity = 1) {
  let product: any = null;
  let exactDenominationId: string | null = null;
  let matchedVariantId: string | null = null;

  if (cpMapping?.dcvProductId) {
    product = await sut.prisma.product.findUnique({ where: { id: cpMapping.dcvProductId } });
    if (cpMapping.dcvDenominationId) exactDenominationId = cpMapping.dcvDenominationId;
  }

  const mappingIsSpecific = !!(cpMapping?.dcvVariantId || cpMapping?.dcvDenominationId);
  if (searchSku && !mappingIsSpecific && !exactDenominationId && !matchedVariantId) {
    const resolved = await sut.resolveSku(searchSku);
    if (resolved) {
      product = resolved.product;
      if (resolved.denominationId) exactDenominationId = resolved.denominationId;
      if (resolved.variantId) matchedVariantId = resolved.variantId;
    }
  }

  let fulfillmentAmount = 0;
  if (matchedVariantId) {
    const matched = await sut.prisma.variant.findUnique({ where: { id: matchedVariantId } });
    if (matched) fulfillmentAmount = Number(matched.customerPrice) * orderQuantity;
  }

  return {
    productId: product?.id ?? null,
    variantId: cpMapping?.dcvVariantId || matchedVariantId || undefined,
    denominationId: exactDenominationId || undefined,
    amount: fulfillmentAmount,
  };
}

test('a product-only mapping no longer shadows the pack the SKU identifies', async () => {
  // Exactly the broken state: the first order auto-wrote dcvProductId.
  const { sut } = scenario(null);
  const result = await route(sut, { dcvProductId: 'p-usa', dcvDenominationId: null, dcvVariantId: null }, 'PSN-USA-ESS-1M');

  assert.equal(result.variantId, 'v-ess-1m', 'the pack must reach fulfillment');
  assert.equal(result.denominationId, undefined, 'no denomination may be pinned');
  assert.equal(result.amount, 9.99, 'priced by the pack, not guessed from the order amount');
});

test('with no mapping at all the pack still resolves', async () => {
  const { sut } = scenario(null);
  const result = await route(sut, null, 'PSN-USA-ESS-1M');
  assert.equal(result.variantId, 'v-ess-1m');
  assert.equal(result.amount, 9.99);
});

test('an admin mapping naming a variant still wins', async () => {
  const { sut } = scenario(null);
  const result = await route(
    sut, { dcvProductId: 'p-usa', dcvDenominationId: null, dcvVariantId: 'v-admin-choice' },
    'PSN-USA-ESS-1M',
  );
  assert.equal(result.variantId, 'v-admin-choice', 'a deliberate mapping is not overridden');
});

test('an admin mapping naming a denomination still wins', async () => {
  const { sut } = scenario(null);
  const result = await route(
    sut, { dcvProductId: 'p-usa', dcvDenominationId: 'd25', dcvVariantId: null },
    'PSN-USA-ESS-1M',
  );
  assert.equal(result.denominationId, 'd25');
  assert.equal(result.variantId, undefined, 'the pinned denomination is the admin intent');
});

test('quantity multiplies the pack price, not the code values', async () => {
  const { sut } = scenario(null);
  const result = await route(sut, null, 'PSN-USA-ESS-1M', 3);
  assert.equal(result.amount, 29.97);
});

test('a plain product SKU is unaffected and pins nothing', async () => {
  const { sut } = scenario(null);
  const result = await route(sut, { dcvProductId: 'p-usa', dcvDenominationId: null, dcvVariantId: null }, 'PSN-USA');
  assert.equal(result.productId, 'p-usa');
  assert.equal(result.variantId, undefined);
  assert.equal(result.amount, 0, 'left for the denomination logic to work out');
});
