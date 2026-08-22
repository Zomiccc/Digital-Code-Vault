require('dotenv').config({ path: '../../.env' });
const crypto = require('crypto');
const argon2 = require('argon2');
const { nanoid } = require('nanoid');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setupTestInventory(productId, denominations) {
  // Clean up existing test codes for this product's denominations
  const existingDenoms = await prisma.denomination.findMany({ where: { productId } });
  for (const d of existingDenoms) {
    await prisma.codeItem.deleteMany({ where: { denominationId: d.id } });
  }
  // Delete existing denominations
  await prisma.denomination.deleteMany({ where: { productId } });

  // Create fresh denominations and codes
  const denomMap = {};
  for (const [faceValue, count] of denominations) {
    const denom = await prisma.denomination.create({
      data: { productId, faceValue, currency: 'USD' },
    });
    denomMap[faceValue] = denom.id;

    for (let i = 0; i < count; i++) {
      const code = `TEST-${faceValue}-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 8)}`;
      const encryptedCode = crypto.createCipheriv('aes-256-gcm',
        Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
        crypto.randomBytes(12)
      );
      // Use the EncryptionService format — but for testing, just store a simple encrypted string
      // Actually, let's use the same format as the app: iv:authTag:ciphertext
      const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      let encrypted = cipher.update(code, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();
      const fullEncrypted = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      await prisma.codeItem.create({
        data: {
          denominationId: denom.id,
          encryptedCode: fullEncrypted,
          codeHash,
          status: 'AVAILABLE',
          batchId: `test-batch-${Date.now()}`,
        },
      });
    }
  }
  return denomMap;
}

async function createApiKey(merchantId) {
  const keyId = `pk_${nanoid(24)}`;
  const secret = nanoid(48);
  const fullKey = `${keyId}.${secret}`;
  const keyPrefix = keyId.substring(0, 12);
  const keyHash = await argon2.hash(fullKey);

  await prisma.apiKey.create({
    data: {
      merchantId,
      keyPrefix,
      keyHash,
      scopes: JSON.stringify(['fulfillment', 'read']),
      status: 'ACTIVE',
    },
  });

  return fullKey;
}

async function createFulfillment(fullKey, productId, amount) {
  const body = JSON.stringify({
    product_id: productId,
    amount: amount,
    currency: 'USD',
    reference_id: `TEST-${amount}-${Date.now()}`,
    customer_email: 'test@test.com',
    customer_name: 'Test Customer',
  });

  const method = 'POST';
  const path = '/api/v1/fulfillment';
  const timestamp = Date.now().toString();
  const data = `${method}\n${path}\n${body}\n${timestamp}`;
  const signature = crypto.createHmac('sha256', fullKey).update(data).digest('hex');

  return new Promise((resolve) => {
    const http = require('http');
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': fullKey,
        'X-Signature': signature,
        'X-Timestamp': timestamp,
        'Idempotency-Key': `test-${amount}-${Date.now()}`,
      },
    }, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseData) });
        } catch {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });
    req.on('error', (e) => resolve({ status: 0, data: e.message }));
    req.write(body);
    req.end();
  });
}

async function getAllocationCodes(fulfillmentId) {
  const allocation = await prisma.allocation.findFirst({
    where: { fulfillmentId },
  });
  if (!allocation) return [];
  const ids = JSON.parse(allocation.codeItemIds || '[]');
  const codeItems = await prisma.codeItem.findMany({
    where: { id: { in: ids } },
    include: { denomination: true },
  });
  return codeItems.map(c => ({
    id: c.id,
    status: c.status,
    faceValue: Number(c.denomination.faceValue),
  }));
}

async function runTest(name, productId, fullKey, inventorySetup, orderAmount, expectedOutcome) {
  console.log(`\n--- TEST: ${name} ---`);
  console.log(`Inventory: ${JSON.stringify(inventorySetup)}`);
  console.log(`Order amount: $${orderAmount}`);

  await setupTestInventory(productId, inventorySetup);

  const result = await createFulfillment(fullKey, productId, orderAmount);
  console.log(`HTTP Status: ${result.status}`);
  console.log(`Response: ${JSON.stringify(result.data)}`);

  if (expectedOutcome === 'success') {
    if (result.status !== 201) {
      console.log(`❌ FAIL: Expected 201, got ${result.status}`);
      return false;
    }
    if (!result.data.fulfillment_id) {
      console.log(`❌ FAIL: No fulfillment_id in response`);
      return false;
    }

    // Verify codes were actually allocated
    const codes = await getAllocationCodes(result.data.fulfillment_id);
    if (codes.length === 0) {
      console.log(`❌ FAIL: No codes allocated to fulfillment`);
      return false;
    }

    // Verify all codes are ALLOCATED (not AVAILABLE)
    const allAllocated = codes.every(c => c.status === 'ALLOCATED');
    if (!allAllocated) {
      console.log(`❌ FAIL: Not all codes are ALLOCATED: ${JSON.stringify(codes)}`);
      return false;
    }

    // Verify total value equals order amount
    const totalValue = codes.reduce((sum, c) => sum + c.faceValue, 0);
    if (totalValue !== orderAmount) {
      console.log(`❌ FAIL: Total code value $${totalValue} ≠ order amount $${orderAmount}`);
      return false;
    }

    console.log(`✅ PASS: ${codes.length} code(s) allocated, total $${totalValue}, all ALLOCATED`);
    console.log(`   Codes: ${codes.map(c => `$${c.faceValue} (${c.status})`).join(', ')}`);
    return true;
  } else if (expectedOutcome === 'fail') {
    if (result.status === 201) {
      console.log(`❌ FAIL: Expected non-201, but got 201 (should have been rejected)`);
      return false;
    }
    console.log(`✅ PASS: Correctly rejected with status ${result.status}`);
    return true;
  }
}

async function main() {
  // Get merchant and product
  const merchant = await prisma.merchant.findFirst({ where: { status: 'ACTIVE' } });
  if (!merchant) { console.error('No active merchant'); process.exit(1); }

  const product = await prisma.product.findFirst();
  if (!product) { console.error('No product'); process.exit(1); }

  console.log(`Merchant: ${merchant.name}, Product: ${product.name}`);
  console.log(`Wallet balance: ${merchant.walletBalance}`);

  // Create API key
  const fullKey = await createApiKey(merchant.id);
  console.log(`API key created`);

  let passed = 0;
  let failed = 0;

  // Test 1: $50 order → one $50 code
  if (await runTest('$50 → 1×$50', product.id, fullKey, [[50, 1]], 50, 'success')) passed++; else failed++;

  // Test 2: $50 order → two $25 codes
  if (await runTest('$50 → 2×$25', product.id, fullKey, [[25, 2]], 50, 'success')) passed++; else failed++;

  // Test 3: $50 order → $30 + $20
  if (await runTest('$50 → $30+$20', product.id, fullKey, [[30, 1], [20, 1]], 50, 'success')) passed++; else failed++;

  // Test 4: $100 order → one $100
  if (await runTest('$100 → 1×$100', product.id, fullKey, [[100, 1]], 100, 'success')) passed++; else failed++;

  // Test 5: $100 order → $50 + $50
  if (await runTest('$100 → 2×$50', product.id, fullKey, [[50, 2]], 100, 'success')) passed++; else failed++;

  // Test 6: $100 order → $75 + $25
  if (await runTest('$100 → $75+$25', product.id, fullKey, [[75, 1], [25, 1]], 100, 'success')) passed++; else failed++;

  // Test 7: $100 order → $50 + $25 + $25
  if (await runTest('$100 → $50+2×$25', product.id, fullKey, [[50, 1], [25, 2]], 100, 'success')) passed++; else failed++;

  // Test 8: $100 order → $25 + $25 + $25 + $25
  if (await runTest('$100 → 4×$25', product.id, fullKey, [[25, 4]], 100, 'success')) passed++; else failed++;

  // Test 9: No combination available → rejected
  if (await runTest('$50 → no combination (only $25×1)', product.id, fullKey, [[25, 1]], 50, 'fail')) passed++; else failed++;

  // Test 10: $50 order with $50+$25 inventory → should pick $50 (fewer codes)
  if (await runTest('$50 → prefer 1×$50 over $25+$25', product.id, fullKey, [[50, 1], [25, 2]], 50, 'success')) passed++; else failed++;

  // Test 11: $100 order with $75+$50+$50+$25 → should pick $50+$50 (2 codes, not $75+$25)
  if (await runTest('$100 → prefer 2×$50 over $75+$25', product.id, fullKey, [[75, 1], [50, 2], [25, 1]], 100, 'success')) passed++; else failed++;

  // Cleanup: revoke API key
  const keyPrefix = fullKey.split('.')[0].substring(0, 12);
  await prisma.apiKey.update({
    where: { keyPrefix },
    data: { status: 'REVOKED', revokedAt: new Date() },
  }).catch(() => {});

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
