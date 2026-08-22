/**
 * E2E test — Variant Preset Fulfillment ("PS Essential 1 Month" → $10 x1 + $20 x1)
 *
 * Flow tested:
 *   T0  Admin login, locate PSN USA product / denominations / variant
 *   T1  Admin presets variant bundle ($10 x1 + $20 x1) via catalog API
 *   T2  Merchant (client's website order) orders the variant -> wallet debit,
 *       exactly one $10 + one $20 code allocated, delivery link issued
 *   T3  Public reveal via delivery token returns EXACTLY those uploaded codes
 *   T4  Out-of-stock order fails with INSUFFICIENT_STOCK and does NOT debit wallet
 *   T5  Direct merchant API (API key + HMAC signing) same result
 *   T6  Idempotency: replaying same Idempotency-Key returns same fulfillment,
 *       no double wallet charge
 *
 * Run:  node test-e2e-presets.js     (from repo root, API running on :3000)
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000/api/v1';
const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, 'apps/api/prisma/dev.db') } } });

// ── load .env ──
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t) { console.log(`\n━━ ${t} ━━`); }

async function api(method, urlPath, { token, body, headers = {} } = {}) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function main() {
  console.log('E2E: Variant Preset Fulfillment\n===============================');

  // ── T0: admin login & locate entities ──
  section('T0 · Setup');
  const adminLogin = await api('POST', '/auth/admin/login', { body: { email: env.ADMIN_BOOTSTRAP_EMAIL, password: env.ADMIN_BOOTSTRAP_PASSWORD } });
  check('admin login', adminLogin.status === 200 && !!adminLogin.data?.access_token, `HTTP ${adminLogin.status}`);
  const admin = adminLogin.data.access_token;

  const hierarchy = (await api('GET', '/admin/catalog/hierarchy', { token: admin })).data;
  const psnUsa = hierarchy.flatMap(c => c.products).find(p => p.name === 'PlayStation USA Digital Code');
  check('PSN USA product found', !!psnUsa);

  const d10 = psnUsa.denominations.find(d => Number(d.faceValue) === 10 && d.currency === 'USD');
  const d20 = psnUsa.denominations.find(d => Number(d.faceValue) === 20 && d.currency === 'USD');
  check('$10 denomination exists', !!d10);
  check('$20 denomination exists', !!d20);

  const variant = psnUsa.productRegions.flatMap(pr => pr.variants).find(v => v.name === 'PS Essential: 1 Month');
  check('"PS Essential: 1 Month" variant found', !!variant);
  if (!variant || !d10 || !d20) return finish();

  // Make the test hermetic: clear any leftover stock on these denominations,
  // so ONLY this run's uploaded codes exist and exact-match asserts hold.
  for (const denom of [d10, d20]) {
    const listed = await api('GET', `/admin/codes?denominationId=${denom.id}&status=AVAILABLE&limit=500`, { token: admin });
    const rows = Array.isArray(listed.data) ? listed.data : listed.data?.items || listed.data?.data || [];
    for (const row of rows) {
      if (row.status === 'AVAILABLE') await api('POST', `/admin/codes/${row.id}/void`, { token: admin, body: {} }).catch(() => {});
    }
    const remaining = await prisma.codeItem.count({ where: { denominationId: denom.id, status: 'AVAILABLE' } });
    console.log(`  (cleared ${denom.currency}$${denom.faceValue} stock — ${remaining} still AVAILABLE)`);
  }

  // fresh codes for this run
  const stamp = Date.now();
  const codes10 = [`QA10-${stamp}-A`, `QA10-${stamp}-B`];
  const codes20 = [`QA20-${stamp}-A`];

  const up10 = await api('POST', '/admin/codes/bulk-upload', { token: admin, body: { denomination_id: d10.id, codes: codes10 } });
  const up20 = await api('POST', '/admin/codes/bulk-upload', { token: admin, body: { denomination_id: d20.id, codes: codes20 } });
  check('bulk upload $10 x2', up10.status === 201 || up10.status === 200, JSON.stringify(up10.data).slice(0, 120));
  check('bulk upload $20 x1', up20.status === 201 || up20.status === 200, JSON.stringify(up20.data).slice(0, 120));

  // ── T1: preset the variant bundle ──
  section('T1 · Admin presets variant bundle');
  const comboName = `QA preset ${stamp}`;
  const created = await api('POST', '/admin/catalog/combinations', {
    token: admin,
    body: { variantId: variant.id, name: comboName, priority: 1, active: true, items: [ { denominationId: d10.id, quantity: 1 }, { denominationId: d20.id, quantity: 1 } ] },
  });
  check('preset created', created.status === 201 || created.status === 200, JSON.stringify(created.data).slice(0, 120));
  const combos = await api('GET', `/admin/catalog/combinations?variantId=${variant.id}`, { token: admin });
  const mine = (combos.data || []).find(c => c.name === comboName);
  check('preset listed for variant with 2 items', !!mine && mine.items.length === 2, mine ? `totalValue=${mine.totalValue}` : '');

  // ── merchant login/create ──
  let mTok = await api('POST', '/auth/merchant/login', { body: { email: 'merchant@test.com', password: 'Test1234!' } });
  if (!(mTok.status === 200)) {
    const createdM = await api('POST', '/admin/merchants', {
      token: admin,
      body: { name: 'QA Merchant', email: `qa-${stamp}@test.com`, password: 'Test1234!x' },
    });
    const mEmail = createdM.data?.email || `qa-${stamp}@test.com`;
    mTok = await api('POST', '/auth/merchant/login', { body: { email: mEmail, password: 'Test1234!x' } });
  }
  check('merchant login', mTok.status === 200 && !!mTok.data?.access_token, `HTTP ${mTok.status}`);
  const merch = mTok.data.access_token;
  const merchantId = mTok.data.user?.merchantId;

  // credit wallet +100
  const credit = await api('POST', `/admin/merchants/${merchantId}/wallet/credit`, { token: admin, body: { amount: 100 } });
  check('wallet credited $100 by admin', credit.status === 201 || credit.status === 200, JSON.stringify(credit.data).slice(0, 100));
  let w = (await api('GET', '/merchant/dashboard/wallet', { token: merch })).data;
  const balBefore = Number(w.balance ?? w.walletBalance ?? w.wallet?.balance);
  check('balance reads 100 before order', balBefore === 100, `balance=${balBefore}`);

  // ── T2: merchant-side order of the variant ──
  section('T2 · Merchant order for "PS Essential: 1 Month"');
  const order = await api('POST', '/merchant/dashboard/fulfillment', {
    token: merch,
    body: { product_id: psnUsa.id, amount: 30, currency: 'USD', variant_id: variant.id, customer_email: 'buyer@example.com', customer_name: 'QA Buyer', reference_id: `qa-${stamp}` },
  });
  check('order accepted (ALLOCATED)', order.status === 201 || order.status === 200, `HTTP ${order.status} ${JSON.stringify(order.data).slice(0, 160)}`);
  check('allocation == [$10, $20] exactly', JSON.stringify(order.data?.allocation) === JSON.stringify(['$10', '$20']), JSON.stringify(order.data?.allocation));
  check('delivery link returned', typeof order.data?.delivery_link === 'string' && order.data.delivery_link.length > 0, order.data?.delivery_link);
  check('wallet_balance_after == 70', Number(order.data?.wallet_balance_after) === 70, String(order.data?.wallet_balance_after));

  const fid = order.data?.fulfillment_id;
  const fr = await prisma.fulfillmentRequest.findUnique({ where: { id: fid }, include: { allocations: true, deliveryToken: true, walletTxn: true } });
  check('DB: fulfillment COMPLETED', fr?.status === 'COMPLETED' || fr?.status === 'ALLOCATED', `status=${fr?.status}`);
  const allocIds = JSON.parse(fr.allocations[0]?.codeItemIds || '[]');
  check('DB: exactly 2 codes allocated', allocIds.length === 2, String(allocIds.length));
  const allocCodes = await prisma.codeItem.findMany({ where: { id: { in: allocIds } }, include: { denomination: true } });
  const faces = allocCodes.map(c => Number(c.denomination.faceValue)).sort((a, b) => a - b);
  check('DB: allocated faces are [$10,$20]', JSON.stringify(faces) === '[10,20]', JSON.stringify(faces));
  check('DB: wallet txn DEBIT 30 recorded', fr.walletTxn && fr.walletTxn.type === 'DEBIT' && Number(fr.walletTxn.amount) === 30, fr.walletTxn ? `${fr.walletTxn.type} ${fr.walletTxn.amount}` : 'none');
  w = (await api('GET', '/merchant/dashboard/wallet', { token: merch })).data;
  check('DB: balance now 70', Number(w.balance ?? 0) === 70, String(w.balance));

  // ── T3: public reveal returns exactly our uploaded codes ──
  section('T3 · Customer reveal via delivery link');
  const token = order.data.delivery_link.split('/').filter(Boolean).pop();
  const info = await api('GET', `/d/${token}`);
  check('delivery info endpoint reachable (no auth)', info.status === 200, `HTTP ${info.status}`);

  const reveal = await api('POST', `/d/${token}/reveal`, { body: {} });
  const revealedCodes = (reveal.data?.codes || []).map((c) => c.code);
  check('reveal succeeded', reveal.status === 200 || reveal.status === 201, `HTTP ${reveal.status}`);
  check(`revealed code #1 matches uploaded $10 code`, revealedCodes.includes(codes10[0]), JSON.stringify(revealedCodes));
  check(`revealed code #2 matches uploaded $20 code`, revealedCodes.includes(codes20[0]));
  check('exactly 2 codes delivered', revealedCodes.length === 2, String(revealedCodes.length));

  const afterReveal = await prisma.codeItem.findMany({ where: { id: { in: allocIds } } });
  check('codes marked DELIVERED after reveal', afterReveal.every(c => c.status === 'DELIVERED'), afterReveal.map(c => c.status).join(','));
  const frAfter = await prisma.fulfillmentRequest.findUnique({ where: { id: fid }, include: { deliveryToken: true } });
  check('delivery token flagged revealed', !!frAfter.deliveryToken?.revealedAt);

  // ── T4: out-of-stock must fail cleanly, no wallet charge ──
  section('T4 · Out-of-stock protection');
  const order2 = await api('POST', '/merchant/dashboard/fulfillment', {
    token: merch,
    body: { product_id: psnUsa.id, amount: 30, currency: 'USD', variant_id: variant.id, reference_id: `qa-oos-${stamp}` },
  });
  const oosFailed = order2.status >= 400 || order2.data?.status === 'FAILED';
  check('second order rejected (no stock)', oosFailed, `HTTP ${order2.status} ${JSON.stringify(order2.data).slice(0, 140)}`);
  w = (await api('GET', '/merchant/dashboard/wallet', { token: merch })).data;
  check('NO wallet charge on failed order', Number(w.balance ?? 0) === 70, `balance=${w.balance}`);

  // ── T5: direct merchant API with API key + HMAC ──
  section('T5 · Merchant API (signed request)');
  const keyRes = await api('POST', '/merchant/dashboard/api-keys', { token: merch, body: { scopes: ['fulfillment', 'read'] } });
  const fullKey = keyRes.data?.key;
  check('api key generated', !!fullKey, JSON.stringify(keyRes.data).slice(0, 80));

  const upA = await api('POST', '/admin/codes/bulk-upload', { token: admin, body: { denomination_id: d10.id, codes: [`QA10-${stamp}-C`] } });
  const upB = await api('POST', '/admin/codes/bulk-upload', { token: admin, body: { denomination_id: d20.id, codes: [`QA20-${stamp}-B`] } });
  check('restock for API test', (upA.status === 200 || upA.status === 201) && (upB.status === 200 || upB.status === 201));

  const idemKey = `qa-${stamp}-api`;
  const payload = JSON.stringify({ product_id: psnUsa.id, amount: 30, currency: 'USD', variant_id: variant.id, reference_id: `qa-api-${stamp}` });
  const ts = String(Date.now());
  const sigPath = '/api/v1/fulfillment';
  const signature = crypto.createHmac('sha256', fullKey).update(`POST\n${sigPath}\n${payload}\n${ts}`).digest('hex');

  const apiOrder = await fetch(BASE + '/fulfillment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': fullKey, 'X-Signature': signature, 'X-Timestamp': ts, 'Idempotency-Key': idemKey },
    body: payload,
  });
  const apiData = await apiOrder.json().catch(() => null);
  check('signed API fulfillment OK', apiOrder.status === 201 || apiOrder.status === 200, `HTTP ${apiOrder.status} ${JSON.stringify(apiData).slice(0, 140)}`);
  check('API allocation == [$10, $20]', JSON.stringify(apiData?.allocation) === JSON.stringify(['$10', '$20']), JSON.stringify(apiData?.allocation));
  w = (await api('GET', '/merchant/dashboard/wallet', { token: merch })).data;
  check('wallet debited to 40 after API order', Number(w.balance ?? 0) === 40, `balance=${w.balance}`);

  // ── T6: idempotent replay ──
  section('T6 · Idempotency replay');
  const ts2 = String(Date.now());
  const sig2 = crypto.createHmac('sha256', fullKey).update(`POST\n${sigPath}\n${payload}\n${ts2}`).digest('hex');
  const replay = await fetch(BASE + '/fulfillment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': fullKey, 'X-Signature': sig2, 'X-Timestamp': ts2, 'Idempotency-Key': idemKey },
    body: payload,
  });
  const replayData = await replay.json().catch(() => null);
  check('replay returns SAME fulfillment id', replayData?.fulfillment_id === apiData?.fulfillment_id, replayData?.fulfillment_id);
  w = (await api('GET', '/merchant/dashboard/wallet', { token: merch })).data;
  check('no double charge on replay', Number(w.balance ?? 0) === 40, `balance=${w.balance}`);

  return finish();
}

function finish() {
  console.log(`\n════════════════════════════`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('════════════════════════════');
  prisma.$disconnect().then(() => process.exit(fail > 0 ? 1 : 0));
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
