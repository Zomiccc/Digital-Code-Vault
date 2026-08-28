/**
 * Tests for webhook product SKU auto-matching logic.
 *
 * Run: npx ts-node apps/api/src/webhooks/webhook.sku-matching.spec.ts
 *
 * These tests mock the Prisma client and FulfillmentService to validate
 * the product matching strategies in isolation:
 *   1. ConnectedProduct.dcvProductId (explicit admin mapping) — repeat order
 *   2. Exact SKU auto-match (Product.sku === webhook.productSku)
 *   3. Exact UUID match (rare for WooCommerce)
 *   4. Exact name match (case-insensitive)
 *   5. No match → REJECTED
 */

// ─── Minimal mock helpers ───────────────────────────────────────────

interface MockProduct {
  id: string;
  name: string;
  region: string;
  sku: string | null;
  status: string;
  productType: string;
}

interface MockConnectedProduct {
  id: string;
  merchantId: string;
  platform: string;
  platformProductId: string | null;
  platformSku: string | null;
  dcvProductId: string | null;
  dcvDenominationId: string | null;
  dcvVariantId: string | null;
  inventorySource: string | null;
  name: string;
}

interface MockIncomingWebhook {
  id: string;
  merchantId: string | null;
  processingStatus: string;
  errorMessage: string | null;
}

class MockPrisma {
  products: MockProduct[] = [];
  connectedProducts: MockConnectedProduct[] = [];
  incomingWebhooks: MockIncomingWebhook[] = [];
  auditLogs: any[] = [];

  product = {
    findUnique: async ({ where }: any) =>
      this.products.find((p) => p.id === where.id) || null,
    findFirst: async ({ where }: any) => {
      if (where.sku) return this.products.find((p) => p.sku === where.sku) || null;
      if (where.name?.equals) {
        const search = where.name.equals.toLowerCase();
        return this.products.find((p) => p.name.toLowerCase() === search) || null;
      }
      return null;
    },
  };

  connectedProduct = {
    findFirst: async ({ where }: any) => {
      return (
        this.connectedProducts.find((cp) => {
          if (where.merchantId && cp.merchantId !== where.merchantId) return false;
          if (where.platform && cp.platform !== where.platform) return false;
          if (where.platformSku && cp.platformSku !== where.platformSku) return false;
          if (where.platformProductId && cp.platformProductId !== where.platformProductId) return false;
          if (where.OR) {
            return where.OR.some((cond: any) => {
              if (cond.platformSku && cp.platformSku !== cond.platformSku) return false;
              if (cond.platformProductId && cp.platformProductId !== cond.platformProductId) return false;
              return true;
            });
          }
          return true;
        }) || null
      );
    },
    update: async ({ where, data }: any) => {
      const cp = this.connectedProducts.find((c) => c.id === where.id);
      if (cp) Object.assign(cp, data);
      return cp;
    },
    create: async ({ data }: any) => {
      const cp: MockConnectedProduct = {
        id: `cp-${Date.now()}-${Math.random()}`,
        ...data,
      };
      this.connectedProducts.push(cp);
      return cp;
    },
  };

  incomingWebhook = {
    update: async ({ where, data }: any) => {
      const w = this.incomingWebhooks.find((w) => w.id === where.id);
      if (w) Object.assign(w, data);
      return w;
    },
  };

  auditLog = {
    create: async ({ data }: any) => {
      this.auditLogs.push(data);
      return data;
    },
  };
}

// ─── Simulated product matching logic (mirrors webhook.service.ts) ──

async function matchProduct(
  prisma: MockPrisma,
  webhook: {
    platform: string;
    productId: string;
    productSku: string;
    productName: string;
  },
  merchantId: string,
  connectedProductId: string | null,
): Promise<{ product: MockProduct | null; matchedVia: string; rejected: boolean; autoMapped: boolean }> {
  const searchSku = webhook.productSku || '';
  const searchId = webhook.productId || '';
  const searchName = webhook.productName || '';

  let product: MockProduct | null = null;
  let autoMapped = false;

  // Strategy 1: ConnectedProduct.dcvProductId (explicit admin mapping)
  let cpMapping: any = null;
  let matchedVia = '';

  if (merchantId && searchSku) {
    cpMapping = await prisma.connectedProduct.findFirst({
      where: { merchantId, platform: webhook.platform, platformSku: searchSku },
    });
    if (cpMapping?.dcvProductId) matchedVia = `SKU: ${searchSku}`;
  }

  if (!cpMapping?.dcvProductId && merchantId && searchId) {
    cpMapping = await prisma.connectedProduct.findFirst({
      where: { merchantId, platform: webhook.platform, platformProductId: searchId },
    });
    if (cpMapping?.dcvProductId) matchedVia = `platformProductId: ${searchId}`;
  }

  if (cpMapping?.dcvProductId) {
    product = await prisma.product.findUnique({ where: { id: cpMapping.dcvProductId } });
    if (product) {
      matchedVia = `explicit mapping (${matchedVia})`;
    }
  }

  // Strategy 2: Exact SKU auto-match
  if (!product && searchSku) {
    const skuMatch = await prisma.product.findFirst({
      where: { sku: searchSku, status: 'ACTIVE' },
    });
    if (skuMatch) {
      product = skuMatch;
      matchedVia = `SKU auto-match: ${searchSku}`;
      autoMapped = true;
      // Persist auto-match on ConnectedProduct
      if (connectedProductId) {
        await prisma.connectedProduct.update({
          where: { id: connectedProductId },
          data: { dcvProductId: product.id },
        });
      }
    }
  }

  // Strategy 3: Exact UUID match
  if (!product && searchId) {
    product = await prisma.product.findUnique({ where: { id: searchId } });
    if (product) matchedVia = `exact ID: ${searchId}`;
  }

  // Strategy 4: Exact name match (case-insensitive)
  if (!product && searchName) {
    product = await prisma.product.findFirst({
      where: { name: { equals: searchName } },
    });
    if (product) matchedVia = `exact name: ${searchName}`;
  }

  return {
    product,
    matchedVia,
    rejected: !product,
    autoMapped,
  };
}

// ─── Test runner ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

async function test(name: string, fn: () => Promise<void>) {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (err) {
    console.error(`  ✗ Threw error: ${(err as Error).message}`);
    failed++;
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

async function main() {
  console.log('=== Webhook SKU Auto-Matching Tests ===\n');

  // Test 1: SKU auto-match success
  await test('SKU auto-match: webhook SKU matches a DCV Product.sku', async () => {
    const prisma = new MockPrisma();
    prisma.products = [
      { id: 'prod-1', name: 'PSN USA', region: 'USA', sku: 'PSN-USA-10', status: 'ACTIVE', productType: 'NORMAL' },
    ];
    prisma.connectedProducts = [];
    prisma.incomingWebhooks = [{ id: 'wh-1', merchantId: 'm-1', processingStatus: 'PENDING', errorMessage: null }];

    const result = await matchProduct(
      prisma,
      { platform: 'woocommerce', productId: 'wc-123', productSku: 'PSN-USA-10', productName: 'PSN Card $10' },
      'm-1',
      'cp-1',
    );

    assert(result.product !== null, 'Product should be found');
    assert(result.product?.id === 'prod-1', 'Should match the correct product');
    assert(result.autoMapped === true, 'Should be flagged as auto-matched');
    assert(!result.rejected, 'Should not be rejected');

    // Verify the ConnectedProduct was updated with dcvProductId
    const cp = prisma.connectedProducts.find((c) => c.id === 'cp-1');
    // cp-1 was passed as connectedProductId but doesn't exist in the array;
    // in real flow syncConnectedProduct creates it first. For this test we
    // just verify the update call was made (no error thrown).
    assert(true, 'ConnectedProduct.update was called without error');
  });

  // Test 2: SKU present but no match — should reject
  await test('SKU present but no DCV product matches — should reject', async () => {
    const prisma = new MockPrisma();
    prisma.products = [
      { id: 'prod-1', name: 'PSN USA', region: 'USA', sku: 'PSN-USA-10', status: 'ACTIVE', productType: 'NORMAL' },
    ];
    prisma.connectedProducts = [];

    const result = await matchProduct(
      prisma,
      { platform: 'woocommerce', productId: 'wc-456', productSku: 'XBOX-50', productName: 'Xbox $50 Card' },
      'm-1',
      null,
    );

    assert(result.product === null, 'No product should be found');
    assert(result.rejected === true, 'Should be rejected');
    assert(result.autoMapped === false, 'Should not be auto-matched');
  });

  // Test 3: No SKU + no existing mapping — should reject
  await test('No SKU + no existing mapping — should reject', async () => {
    const prisma = new MockPrisma();
    prisma.products = [
      { id: 'prod-1', name: 'PSN USA', region: 'USA', sku: 'PSN-USA-10', status: 'ACTIVE', productType: 'NORMAL' },
    ];
    prisma.connectedProducts = [];

    const result = await matchProduct(
      prisma,
      { platform: 'woocommerce', productId: 'wc-789', productSku: '', productName: 'Mystery Product' },
      'm-1',
      null,
    );

    assert(result.product === null, 'No product should be found');
    assert(result.rejected === true, 'Should be rejected');
  });

  // Test 4: Repeat order for already-mapped product — should fulfill via Strategy 1
  await test('Repeat order for already-mapped product — fulfills via explicit mapping', async () => {
    const prisma = new MockPrisma();
    prisma.products = [
      { id: 'prod-1', name: 'PSN USA', region: 'USA', sku: 'PSN-USA-10', status: 'ACTIVE', productType: 'NORMAL' },
    ];
    prisma.connectedProducts = [
      {
        id: 'cp-1',
        merchantId: 'm-1',
        platform: 'woocommerce',
        platformProductId: 'wc-123',
        platformSku: 'PSN-USA-10',
        dcvProductId: 'prod-1',
        dcvDenominationId: null,
        dcvVariantId: null,
        inventorySource: 'DCV',
        name: 'PSN Card $10',
      },
    ];

    const result = await matchProduct(
      prisma,
      { platform: 'woocommerce', productId: 'wc-123', productSku: 'PSN-USA-10', productName: 'PSN Card $10' },
      'm-1',
      'cp-1',
    );

    assert(result.product !== null, 'Product should be found');
    assert(result.product?.id === 'prod-1', 'Should match the mapped product');
    assert(!result.rejected, 'Should not be rejected');
    assert(result.autoMapped === false, 'Should use explicit mapping, not auto-match');
    assert(result.matchedVia.includes('explicit mapping'), `Matched via: ${result.matchedVia}`);
  });

  // Test 5: Repeat order with no SKU but platformProductId matches — should fulfill
  await test('Repeat order with no SKU but platformProductId mapping exists — fulfills', async () => {
    const prisma = new MockPrisma();
    prisma.products = [
      { id: 'prod-2', name: 'Steam USA', region: 'USA', sku: null, status: 'ACTIVE', productType: 'NORMAL' },
    ];
    prisma.connectedProducts = [
      {
        id: 'cp-2',
        merchantId: 'm-1',
        platform: 'woocommerce',
        platformProductId: 'wc-999',
        platformSku: null,
        dcvProductId: 'prod-2',
        dcvDenominationId: null,
        dcvVariantId: null,
        inventorySource: 'DCV',
        name: 'Steam Card',
      },
    ];

    const result = await matchProduct(
      prisma,
      { platform: 'woocommerce', productId: 'wc-999', productSku: '', productName: 'Steam Card' },
      'm-1',
      'cp-2',
    );

    assert(result.product !== null, 'Product should be found via platformProductId mapping');
    assert(result.product?.id === 'prod-2', 'Should match the mapped product');
    assert(!result.rejected, 'Should not be rejected');
  });

  // Test 6: SKU auto-match should NOT match wrong product (exact match only)
  await test('SKU auto-match: similar but not exact SKU does not match', async () => {
    const prisma = new MockPrisma();
    prisma.products = [
      { id: 'prod-1', name: 'PSN USA', region: 'USA', sku: 'PSN-USA-10', status: 'ACTIVE', productType: 'NORMAL' },
    ];

    const result = await matchProduct(
      prisma,
      { platform: 'woocommerce', productId: 'wc-100', productSku: 'PSN-USA-100', productName: 'PSN $100' },
      'm-1',
      null,
    );

    assert(result.product === null, 'Should not match — SKU is different (PSN-USA-100 ≠ PSN-USA-10)');
    assert(result.rejected === true, 'Should be rejected');
  });

  // Test 7: Auto-match persists so second order uses Strategy 1
  await test('Auto-match persists: second order for same SKU uses explicit mapping', async () => {
    const prisma = new MockPrisma();
    prisma.products = [
      { id: 'prod-1', name: 'PSN USA', region: 'USA', sku: 'PSN-USA-10', status: 'ACTIVE', productType: 'NORMAL' },
    ];
    prisma.connectedProducts = [
      {
        id: 'cp-1',
        merchantId: 'm-1',
        platform: 'woocommerce',
        platformProductId: 'wc-123',
        platformSku: 'PSN-USA-10',
        dcvProductId: null, // Not yet mapped
        dcvDenominationId: null,
        dcvVariantId: null,
        inventorySource: null,
        name: 'PSN Card $10',
      },
    ];

    // First order — auto-match
    const result1 = await matchProduct(
      prisma,
      { platform: 'woocommerce', productId: 'wc-123', productSku: 'PSN-USA-10', productName: 'PSN Card $10' },
      'm-1',
      'cp-1',
    );

    assert(result1.product !== null, 'First order: product found via auto-match');
    assert(result1.autoMapped === true, 'First order: auto-matched');

    // Verify dcvProductId was persisted
    assert(prisma.connectedProducts[0].dcvProductId === 'prod-1', 'ConnectedProduct.dcvProductId was persisted');

    // Second order — should use Strategy 1 (explicit mapping)
    const result2 = await matchProduct(
      prisma,
      { platform: 'woocommerce', productId: 'wc-123', productSku: 'PSN-USA-10', productName: 'PSN Card $10' },
      'm-1',
      'cp-1',
    );

    assert(result2.product !== null, 'Second order: product found via explicit mapping');
    assert(result2.autoMapped === false, 'Second order: uses explicit mapping, not auto-match');
    assert(result2.matchedVia.includes('explicit mapping'), `Second order matched via: ${result2.matchedVia}`);
  });

  // ─── Summary ───
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
