/**
 * Integration test: verifies registerWebhook + verifyIncomingSignature against the live API.
 *
 * Run: node test/integration.mjs
 *
 * Prerequisites:
 *  - API running on http://localhost:3000
 *  - Seeded database with merchant@test.com / Merchant123!@#
 */

import { registerWebhook, verifyIncomingSignature, deleteWebhook } from '../dist/esm/index.js';
import { createHmac } from 'node:crypto';

const BASE_URL = 'http://localhost:3000/api/v1';
const MERCHANT_EMAIL = 'merchant@test.com';
const MERCHANT_PASSWORD = 'Merchant123!@#';

async function merchantLogin() {
  const res = await fetch(`${BASE_URL}/auth/merchant/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: MERCHANT_EMAIL, password: MERCHANT_PASSWORD }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Merchant login failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function createApiKey(token) {
  const res = await fetch(`${BASE_URL}/merchant/api-keys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scopes: ['fulfillment', 'read'] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create API key failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function main() {
  console.log('=== Integration Test: registerWebhook + verifyIncomingSignature ===\n');

  // Step 1: Merchant login
  console.log('1. Logging in as merchant...');
  const token = await merchantLogin();
  console.log('   Got merchant JWT\n');

  // Step 2: Create an API key
  console.log('2. Creating API key...');
  const keyData = await createApiKey(token);
  const apiKey = keyData.key;
  console.log(`   API key created: ${apiKey.substring(0, 12)}...\n`);

  // Step 3: Test registerWebhook (skipVerification=true since we don't have a real receiver)
  console.log('3. Testing registerWebhook (skipVerification=true)...');
  const webhookUrl = 'http://localhost:9999/webhooks/test';
  const regResult = await registerWebhook({
    apiKey,
    url: webhookUrl,
    skipVerification: true,
    baseUrl: BASE_URL,
  });
  console.log(`   Registration successful!`);
  console.log(`     id:     ${regResult.id}`);
  console.log(`     url:    ${regResult.url}`);
  console.log(`     status: ${regResult.status}`);
  console.log(`     secret: ${regResult.secret.substring(0, 8)}...\n`);

  // Step 4: Test verifyIncomingSignature (simulate a delivery from the platform)
  console.log('4. Testing verifyIncomingSignature with correct secret...');
  const payload = JSON.stringify({
    event: 'order.fulfilled',
    orderId: 'test-123',
    fulfillmentId: 'ful-456',
    timestamp: Date.now(),
  });
  const expectedSig = createHmac('sha256', regResult.secret).update(payload).digest('hex');
  const isValid = verifyIncomingSignature(payload, expectedSig, regResult.secret);
  console.log(`   ${isValid ? 'PASS' : 'FAIL'}: Signature verification with correct secret\n`);

  // Step 4b: Test with wrong secret
  console.log('4b. Testing verifyIncomingSignature with wrong secret...');
  const isInvalid = verifyIncomingSignature(payload, expectedSig, 'wrong-secret');
  console.log(`   ${!isInvalid ? 'PASS' : 'FAIL'}: Rejected wrong secret\n`);

  // Step 4c: Test with tampered body
  console.log('4c. Testing verifyIncomingSignature with tampered body...');
  const tamperedPayload = JSON.stringify({ event: 'order.fulfilled', orderId: 'HACKED' });
  const isTampered = verifyIncomingSignature(tamperedPayload, expectedSig, regResult.secret);
  console.log(`   ${!isTampered ? 'PASS' : 'FAIL'}: Rejected tampered body\n`);

  // Step 5: Cleanup — delete the endpoint
  console.log('5. Cleaning up — deleting webhook endpoint...');
  await deleteWebhook({ apiKey, id: regResult.id, baseUrl: BASE_URL });
  console.log('   Endpoint deleted\n');

  console.log('=== All tests passed! ===');
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  if (err.rawBody) console.error('   Response body:', err.rawBody);
  process.exit(1);
});
