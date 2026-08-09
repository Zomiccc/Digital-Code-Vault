/**
 * Comprehensive Merchant Site Connection Test
 * Tests: WooCommerce, Shopify, Stripe, PayPal, Elementor, Custom/Hard-coded
 * + HMAC Security + Direct API Fulfillment
 */
const http = require('http');
const crypto = require('crypto');

const API_HOST = 'localhost';
const API_PORT = 3000;
const API_BASE = '/api/v1';

let passed = 0, failed = 0;
let merchantToken = '', merchantId = '', productId = '', denominationId = '';
let apiKey = '', apiKeySecret = '', webhookSecret = '';

function logSection(title) {
  console.log(`\n${'='.repeat(70)}\n  ${title}\n${'='.repeat(70)}`);
}

function track(pass, msg) {
  if (pass) { passed++; console.log(`    ✅ PASS — ${msg}`); }
  else { failed++; console.log(`    ❌ FAIL — ${msg}`); }
}

function apiRequest(path, method, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: API_HOST, port: API_PORT,
      path: `${API_BASE}${path}`, method,
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: { raw: buf } }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function signRequest(method, path, body, secret) {
  const timestamp = Date.now().toString();
  const fullPath = `${API_BASE}${path}`;
  const bodyStr = body ? JSON.stringify(body) : '';
  const raw = `${method.toUpperCase()}\n${fullPath}\n${bodyStr}\n${timestamp}`;
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return { sig, timestamp };
}

function authHeaders(method, path, body) {
  const { sig, timestamp } = signRequest(method, path, body, apiKey);
  return { 'X-API-Key': apiKey, 'X-Signature': sig, 'X-Timestamp': timestamp };
}

// ─── Steps ───

async function step1_merchantLogin() {
  logSection('STEP 1: Merchant Login');
  const res = await apiRequest('/auth/merchant/login', 'POST', {
    email: 'merchant@test.com', password: 'Merchant123!@#',
  });
  if (res.status === 200 && res.body.access_token) {
    merchantToken = res.body.access_token;
    merchantId = res.body.user.merchantId;
    track(true, `Merchant logged in: ${merchantId}`);
  } else {
    track(false, `Login failed: ${res.status}`);
    throw new Error('Cannot continue without merchant token');
  }
}

async function step2_getProducts() {
  logSection('STEP 2: Fetch Products');
  const res = await apiRequest('/products', 'GET', null, { Authorization: `Bearer ${merchantToken}` });
  if (res.status === 200 && Array.isArray(res.body) && res.body.length > 0) {
    productId = res.body[0].id;
    track(true, `Found ${res.body.length} product(s), using: ${res.body[0].name}`);
  } else {
    track(false, `Failed: ${res.status}`);
    throw new Error('No products found');
  }
}

async function step3_getDenominations() {
  logSection('STEP 3: Fetch Denominations');
  const res = await apiRequest(`/products/${productId}/denominations`, 'GET', null, { Authorization: `Bearer ${merchantToken}` });
  if (res.status === 200 && Array.isArray(res.body) && res.body.length > 0) {
    const ten = res.body.find((d) => Number(d.faceValue) === 10 || Number(d.face_value) === 10);
    if (ten) { denominationId = ten.id; track(true, `Using $10 denomination: ${denominationId}`); }
    else { track(false, `$10 denomination not found. Available: ${JSON.stringify(res.body.map((d) => d.face_value ?? d.faceValue))}`); }
  } else { track(false, `Failed: ${res.status}`); }
}

async function step3_5_uploadExtraCodes() {
  logSection('STEP 3.5: Upload Extra Codes');
  const adminLogin = await apiRequest('/auth/admin/login', 'POST', { email: 'admin@digitalcode.local', password: 'ac35b19310c53df035b617ecfb6a9c2d' });
  if (adminLogin.status !== 200 || !adminLogin.body.access_token) { track(false, `Admin login failed: ${adminLogin.status}`); return; }
  const adminToken = adminLogin.body.access_token;
  track(true, 'Admin logged in');
  const codes = [];
  for (let i = 0; i < 30; i++) codes.push(`TEST-CODE-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
  const res = await apiRequest('/admin/codes/bulk-upload', 'POST', { denomination_id: denominationId, codes }, { Authorization: `Bearer ${adminToken}` });
  if (res.status === 201) track(true, `Uploaded ${res.body.inserted || codes.length} extra codes`);
  else track(false, `Bulk upload failed: ${res.status} ${JSON.stringify(res.body)}`);
}

async function step4_generateApiKey() {
  logSection('STEP 4: Generate API Key');
  // List and revoke old API keys to avoid hitting the active key limit
  const listRes = await apiRequest('/merchant/api-keys', 'GET', null, { Authorization: `Bearer ${merchantToken}` });
  const existingKeys = listRes.body?.keys || (Array.isArray(listRes.body) ? listRes.body : []);
  if (listRes.status === 200 && Array.isArray(existingKeys)) {
    for (const key of existingKeys) {
      if (key.id && key.status === 'ACTIVE') {
        await apiRequest(`/merchant/api-keys/${key.id}`, 'DELETE', null, { Authorization: `Bearer ${merchantToken}` });
      }
    }
  }
  const res = await apiRequest('/merchant/api-keys', 'POST', { scopes: ['fulfillment', 'read'] }, { Authorization: `Bearer ${merchantToken}` });
  if (res.status === 201 && res.body.key) {
    apiKey = res.body.key;
    track(true, `API key generated: ${apiKey.substring(0, 12)}...`);
  } else { track(false, `Failed: ${res.status} ${JSON.stringify(res.body)}`); throw new Error('Need API key'); }
}

async function step5_registerWebhookEndpoint() {
  logSection('STEP 5: Register Webhook Endpoint');
  const path = '/webhooks/endpoints';
  const body = { url: 'http://localhost:9876/webhook', skipVerification: true };
  const res = await apiRequest(path, 'POST', body, authHeaders('POST', path, body));
  if (res.status === 201 && res.body.id) track(true, `Endpoint registered: ${res.body.id}`);
  else track(false, `Failed: ${res.status} ${JSON.stringify(res.body)}`);
}

async function step5_5_fetchWebhookSecret() {
  logSection('STEP 5.5: Fetch Webhook Secret');
  const res = await apiRequest('/merchant/webhook-secret', 'GET', null, { Authorization: `Bearer ${merchantToken}` });
  if (res.status === 200 && res.body.webhook_secret) {
    webhookSecret = res.body.webhook_secret;
    track(true, `Webhook secret fetched: ${webhookSecret.substring(0, 12)}...`);
  } else { track(false, `Failed: ${res.status} ${JSON.stringify(res.body)}`); throw new Error('Need webhook secret'); }
}

async function step6_listWebhookEndpoints() {
  logSection('STEP 6: List Webhook Endpoints');
  const path = '/webhooks/endpoints';
  const res = await apiRequest(path, 'GET', null, authHeaders('GET', path, null));
  if (res.status === 200 && Array.isArray(res.body)) track(true, `Listed ${res.body.length} endpoint(s)`);
  else track(false, `Failed: ${res.status} ${JSON.stringify(res.body)}`);
}

async function sendWebhook(payload, headers, label) {
  const finalHeaders = { ...headers, 'X-Webhook-Secret': webhookSecret };
  const res = await apiRequest('/webhooks/incoming', 'POST', payload, finalHeaders);
  if (res.status === 201 && res.body.success) {
    track(true, `${label} webhook accepted: ${res.body.webhookId}`);
    track(true, `Event ID: ${res.body.eventId}`);
    return true;
  }
  track(false, `${label} webhook failed: ${res.status} ${JSON.stringify(res.body)}`);
  return false;
}

async function step7_woocommerce() {
  logSection('STEP 7: WooCommerce Webhook');
  await sendWebhook({
    id: `wc-${Date.now()}`, order: { id: `wc-order-${Date.now()}`, status: 'completed', total: '10', currency: 'USD',
      billing: { first_name: 'WC', last_name: 'User', email: 'wc@test.com' },
      line_items: [{ product_id: 'psn10', name: 'PSN $10', quantity: 1, sku: 'PSN-USD-10' }] },
  }, { 'X-WC-Webhook-Source': 'https://woo.test', 'X-WC-Webhook-Topic': 'order.status_changed' }, 'WooCommerce');
}

async function step8_shopify() {
  logSection('STEP 8: Shopify Webhook');
  await sendWebhook({
    id: `shopify-${Date.now()}`, order: { id: `shop-order-${Date.now()}`, total_price: '10.00', currency: 'USD', financial_status: 'paid',
      customer: { first_name: 'Shop', last_name: 'User', email: 'shop@test.com' },
      line_items: [{ product_id: 'psn10', title: 'PSN $10 Gift Card', quantity: 1, sku: 'PSN-USD-10' }] },
  }, { 'X-Shopify-Topic': 'orders/paid', 'X-Shopify-Hmac-Sha256': 'test-hash' }, 'Shopify');
}

async function step9_stripe() {
  logSection('STEP 9: Stripe Webhook');
  await sendWebhook({
    id: `evt_${Date.now()}`, type: 'payment_intent.succeeded',
    data: { object: { id: `pi_${Date.now()}`, amount: 1000, currency: 'usd', status: 'succeeded', receipt_email: 'stripe@test.com',
      metadata: { product_name: 'PSN', sku: 'PSN-USD-10' }, shipping: { name: 'Stripe User' } } },
  }, { 'Stripe-Signature': 't=1,v1=test' }, 'Stripe');
}

async function step10_paypal() {
  logSection('STEP 10: PayPal Webhook');
  await sendWebhook({
    id: `paypal-${Date.now()}`, resource: { id: `pp-${Date.now()}`, status: 'COMPLETED', amount: { value: '10.00', currency_code: 'USD' },
      items: [{ name: 'PSN $10', sku: 'PSN-USD-10', quantity: '1' }], invoice_id: `pp-inv-${Date.now()}`,
      payer: { name: { given_name: 'Pay', surname: 'User' }, email_address: 'paypal@test.com' } },
  }, { 'PayPal-Transmission-Id': 'test-tid' }, 'PayPal');
}

async function step11_elementor() {
  logSection('STEP 11: Elementor Form Webhook');
  await sendWebhook({
    platform: 'elementor', source: 'elementor_form', form_id: 'contact_form_1',
    form_fields: { name: 'Elementor User', email: 'elementor@test.com' },
    order_id: `elementor-${Date.now()}`, product_name: 'PSN', product_sku: 'PSN-USD-10',
    customer_name: 'Elementor User', customer_email: 'elementor@test.com',
    amount: 10, currency: 'USD', payment_status: 'paid', order_status: 'completed',
  }, { 'X-WC-Webhook-Source': 'https://wp.test', 'X-WC-Webhook-Topic': 'elementor.form.submitted' }, 'Elementor');
}

async function step12_custom() {
  logSection('STEP 12: Custom/Hard-coded Webhook');
  await sendWebhook({
    platform: 'custom_store', order_id: `CUSTOM-${Date.now()}`, product_name: 'PSN', product_sku: 'PSN-USD-10',
    customer_name: 'Custom User', customer_email: 'custom@test.com',
    amount: 10, currency: 'USD', payment_status: 'paid', order_status: 'completed',
  }, {}, 'Custom site');
}

async function step13_duplicate() {
  logSection('STEP 13: Duplicate Webhook Detection');
  const payload = { platform: 'test', order_id: 'dup-test-1', product_name: 'PSN', amount: 10, currency: 'USD', payment_status: 'paid', event_id: 'DUP-EVENT-001' };
  const authHdr = { 'X-Webhook-Secret': webhookSecret };
  const r1 = await apiRequest('/webhooks/incoming', 'POST', payload, authHdr);
  const r2 = await apiRequest('/webhooks/incoming', 'POST', payload, authHdr);
  if (r1.status === 201) track(true, 'First webhook accepted');
  else track(false, `First failed: ${r1.status} ${JSON.stringify(r1.body)}`);
  if (r2.status === 201 && r2.body.message?.includes('Duplicate')) track(true, 'Duplicate rejected');
  else track(false, `Duplicate not detected: ${r2.status} ${JSON.stringify(r2.body)}`);
}

async function step14_directFulfillment() {
  logSection('STEP 14: Direct API Fulfillment');
  const path = '/fulfillment';
  const body = { product_id: productId, amount: 10, currency: 'USD', customer_email: 'direct@test.com', customer_name: 'Direct User' };
  const idemKey = `direct-${Date.now()}`;
  const res = await apiRequest(path, 'POST', body, { ...authHeaders('POST', path, body), 'Idempotency-Key': idemKey });
  if (res.status === 201 && res.body.fulfillment_id) {
    track(true, `Fulfillment created: ${res.body.fulfillment_id}`);
    track(true, `Status: ${res.body.status}`);
  } else { track(false, `Failed: ${res.status} ${JSON.stringify(res.body)}`); }
}

async function step15_paymentNotify() {
  logSection('STEP 15: Payment Notification');
  const path = '/notify/payment';
  const body = { product_id: productId, amount: 10, currency: 'USD', customer_email: 'notify@test.com', customer_name: 'Notify User' };
  const idemKey = `notify-${Date.now()}`;
  const res = await apiRequest(path, 'POST', body, { ...authHeaders('POST', path, body), 'Idempotency-Key': idemKey });
  if (res.status === 201) track(true, `Payment notification processed: ${res.body.fulfillment_id || 'OK'}`);
  else track(false, `Failed: ${res.status} ${JSON.stringify(res.body)}`);
}

async function step16_verifyIncoming() {
  logSection('STEP 16: Verify Incoming Webhooks');
  const res = await apiRequest('/webhooks/incoming', 'GET', null, { Authorization: `Bearer ${merchantToken}` });
  if (res.status === 200 && Array.isArray(res.body)) {
    track(true, `Retrieved ${res.body.length} incoming webhook(s)`);
    const platforms = [...new Set(res.body.map((w) => w.platform))];
    track(true, `Platforms: ${platforms.join(', ')}`);
  } else { track(false, `Failed: ${res.status}`); }
}

async function step17_connectedProducts() {
  logSection('STEP 17: Connected Products');
  const res = await apiRequest('/webhooks/connected-products', 'GET', null, { Authorization: `Bearer ${merchantToken}` });
  if (res.status === 200 && Array.isArray(res.body)) track(true, `Found ${res.body.length} connected product(s)`);
  else track(false, `Failed: ${res.status}`);
}

async function step18_statistics() {
  logSection('STEP 18: Webhook Statistics');
  const res = await apiRequest('/webhooks/statistics', 'GET', null, { Authorization: `Bearer ${merchantToken}` });
  if (res.status === 200 && res.body) track(true, `Stats: total=${res.body.total}, completed=${res.body.completed}, failed=${res.body.failed}`);
  else track(false, `Failed: ${res.status}`);
}

async function step19_deleteEndpoint() {
  logSection('STEP 19: Delete Webhook Endpoint');
  const listPath = '/webhooks/endpoints';
  const list = await apiRequest(listPath, 'GET', null, authHeaders('GET', listPath, null));
  if (list.status === 200 && list.body.length > 0) {
    const id = list.body[0].id;
    const delPath = `/webhooks/endpoints/${id}`;
    const res = await apiRequest(delPath, 'DELETE', null, authHeaders('DELETE', delPath, null));
    if (res.status === 200) track(true, `Endpoint deleted: ${id}`);
    else track(false, `Failed: ${res.status}`);
  } else { track(false, 'No endpoints to delete'); }
}

async function step20_invalidSignature() {
  logSection('STEP 20: HMAC Security — Invalid Signature');
  const res = await apiRequest('/fulfillment', 'POST', { product_id: productId, amount: 10 }, { 'X-API-Key': apiKey, 'X-Signature': 'wrong', 'X-Timestamp': Date.now().toString(), 'Idempotency-Key': 'test' });
  if (res.status === 401) track(true, 'Invalid signature rejected (401)');
  else track(false, `Expected 401, got ${res.status}`);
}

async function step21_missingCredentials() {
  logSection('STEP 21: HMAC Security — Missing Credentials');
  const res = await apiRequest('/fulfillment', 'POST', { product_id: productId, amount: 10 }, { 'Idempotency-Key': 'test' });
  if (res.status === 401) track(true, 'Missing credentials rejected (401)');
  else track(false, `Expected 401, got ${res.status}`);
}

async function step22_missingWebhookSecret() {
  logSection('STEP 22: Webhook Security — Missing Webhook Secret');
  const res = await apiRequest('/webhooks/incoming', 'POST', { id: 'test-no-secret', order: { id: 'o1', status: 'completed', total: '10', currency: 'USD', billing: { email: 't@t.com' }, line_items: [{ sku: 'PSN-USD-10' }] } }, { 'X-WC-Webhook-Source': 'https://evil.test', 'X-WC-Webhook-Topic': 'order.status_changed' });
  if (res.status === 400 && res.body.code === 'MISSING_WEBHOOK_SECRET') track(true, 'Missing webhook secret rejected (400)');
  else track(false, `Expected 400 MISSING_WEBHOOK_SECRET, got ${res.status} ${JSON.stringify(res.body)}`);
}

async function step23_invalidWebhookSecret() {
  logSection('STEP 23: Webhook Security — Invalid Webhook Secret');
  const res = await apiRequest('/webhooks/incoming', 'POST', { id: 'test-bad-secret', order: { id: 'o2', status: 'completed', total: '10', currency: 'USD', billing: { email: 't@t.com' }, line_items: [{ sku: 'PSN-USD-10' }] } }, { 'X-WC-Webhook-Source': 'https://evil.test', 'X-WC-Webhook-Topic': 'order.status_changed', 'X-Webhook-Secret': 'invalid-secret-12345' });
  if (res.status === 400 && res.body.code === 'INVALID_WEBHOOK_SECRET') track(true, 'Invalid webhook secret rejected (400)');
  else track(false, `Expected 400 INVALID_WEBHOOK_SECRET, got ${res.status} ${JSON.stringify(res.body)}`);
}

// ─── Main ───

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║     Digital Code Vault — Merchant Site Connection Test Suite        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`  API: http://${API_HOST}:${API_PORT}${API_BASE}\n`);

  const steps = [
    step1_merchantLogin, step2_getProducts, step3_getDenominations, step3_5_uploadExtraCodes,
    step4_generateApiKey, step5_registerWebhookEndpoint, step5_5_fetchWebhookSecret, step6_listWebhookEndpoints,
    step7_woocommerce, step8_shopify, step9_stripe, step10_paypal,
    step11_elementor, step12_custom, step13_duplicate, step14_directFulfillment,
    step15_paymentNotify, step16_verifyIncoming, step17_connectedProducts,
    step18_statistics, step19_deleteEndpoint, step20_invalidSignature, step21_missingCredentials,
    step22_missingWebhookSecret, step23_invalidWebhookSecret,
  ];

  for (const step of steps) {
    try { await step(); await new Promise(r => setTimeout(r, 1500)); }
    catch (err) { console.log(`  ⚠️  Error: ${err.message}`); failed++; }
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                        TEST SUMMARY                                  ║');
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Passed: ${passed}                                                           ║`);
  console.log(`║  Failed: ${failed}                                                           ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
