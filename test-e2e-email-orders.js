/**
 * E2E test #2 — Real orders with EMAIL delivery to ashir.qureshi.aqq@gmail.com
 *
 * Scenarios:
 *   A · "PS Essential: 3 Months" preset order  -> delivers $50 x1 + $30 x1
 *   B · Plain $10 code order                   -> delivers $10 x1
 *   C · Plain $50 order, NO $50 stock          -> largest-first fallback -> $25 + $25
 *
 * Every order uses customer_email = ashir.qureshi.aqq@gmail.com and we verify
 * SendGrid actually accepted the emails (EmailLog status SENT).
 *
 * Run:  node test-e2e-email-orders.js     (API running on :3000)
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000/api/v1';
const GMAIL = 'ashir.qureshi.aqq@gmail.com';
const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, 'apps/api/prisma/dev.db') } } });

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

async function api(method, urlPath, { token, body } = {}) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function waitForEmails(since, minCount, label, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let rows = [];
  while (Date.now() < deadline) {
    rows = await prisma.emailLog.findMany({
      where: { recipient: GMAIL, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length >= minCount && rows.every((r) => r.status === 'SENT' || r.status === 'FAILED')) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return rows;
}

async function main() {
  console.log(`E2E #2 — Orders with real email to ${GMAIL}\n==========================================`);

  // Setup
  section('Setup');
  const adminLogin = await api('POST', '/auth/admin/login', { body: { email: env.ADMIN_BOOTSTRAP_EMAIL, password: env.ADMIN_BOOTSTRAP_PASSWORD } });
  check('admin login', adminLogin.status === 200);
  const admin = adminLogin.data.access_token;

  const hierarchy = (await api('GET', '/admin/catalog/hierarchy', { token: admin })).data;
  const psnUsa = hierarchy.flatMap((c) => c.products).find((p) => p.name === 'PlayStation USA Digital Code');
  const denoms = {};
  for (const v of [10, 25, 30, 50]) {
    denoms[v] = psnUsa.denominations.find((d) => Number(d.faceValue) === v && d.currency === 'USD');
    check(`$${v} denomination exists`, !!denoms[v]);
  }
  const variant3m = psnUsa.productRegions.flatMap((pr) => pr.variants).find((v) => v.name === 'PS Essential: 3 Months');
  check('"PS Essential: 3 Months" variant found', !!variant3m);

  // Hermetic stock: clear leftovers on these denoms, then upload exact amounts
  for (const denom of Object.values(denoms)) {
    const listed = await api('GET', `/admin/codes?denominationId=${denom.id}&status=AVAILABLE&limit=500`, { token: admin });
    const rows = Array.isArray(listed.data) ? listed.data : listed.data?.items || listed.data?.data || [];
    for (const row of rows) {
      if (row.status === 'AVAILABLE') await api('POST', `/admin/codes/${row.id}/void`, { token: admin, body: {} }).catch(() => {});
    }
  }
  const stamp = Date.now();
  const plain = {
    50: [`QA50-${stamp}-A`],
    30: [`QA30-${stamp}-A`],
    10: [`QA10-${stamp}-E`],
    25: [`QA25-${stamp}-A`, `QA25-${stamp}-B`],
  };
  for (const [val, codes] of Object.entries(plain)) {
    const up = await api('POST', '/admin/codes/bulk-upload', { token: admin, body: { denomination_id: denoms[val].id, codes } });
    check(`upload $${val} x${codes.length}`, up.status === 200 || up.status === 201, JSON.stringify(up.data).slice(0, 90));
  }

  // Preset: PS Essential 3 Months -> $50 x1 + $30 x1
  const preset = await api('POST', '/admin/catalog/combinations', {
    token: admin,
    body: { variantId: variant3m.id, name: '3M Essentials bundle', priority: 1, active: true, items: [
      { denominationId: denoms[50].id, quantity: 1 }, { denominationId: denoms[30].id, quantity: 1 } ] },
  });
  check('preset set for 3 Months = $50 + $30', preset.status === 200 || preset.status === 201);

  // Merchant + wallet (create QA merchant if the seeded one doesn't exist)
  let mTok = await api('POST', '/auth/merchant/login', { body: { email: 'merchant@test.com', password: 'Test1234!' } });
  if (!(mTok.status === 200 && mTok.data?.user?.merchantId)) {
    const qaEmail = `qa-mail-${stamp}@test.com`;
    await api('POST', '/admin/merchants', { token: admin, body: { name: 'QA Mail Merchant', email: qaEmail, password: 'Test1234!x' } });
    mTok = await api('POST', '/auth/merchant/login', { body: { email: qaEmail, password: 'Test1234!x' } });
  }
  check('merchant login', mTok.status === 200 && !!mTok.data?.user?.merchantId);
  const merch = mTok.data.access_token;
  const merchantId = mTok.data.user.merchantId;
  await api('POST', `/admin/merchants/${merchantId}/wallet/credit`, { token: admin, body: { amount: 500 } });
  let w = (await api('GET', '/merchant/dashboard/wallet', { token: merch })).data;
  const startBal = Number(w.balance ?? 0);
  check('wallet funded to 500', startBal === 500, `balance=${startBal}`);

  // ── Scenario A: variant order -> $50 + $30 ──
  section('A · Client orders "PS Essential: 3 Months" (preset: $50+$30)');
  const t0 = new Date();
  const orderA = await api('POST', '/merchant/dashboard/fulfillment', {
    token: merch,
    body: { product_id: psnUsa.id, amount: 80, currency: 'USD', variant_id: variant3m.id, customer_email: GMAIL, customer_name: 'Ashir Qureshi', reference_id: `qa-mail-A-${stamp}` },
  });
  check('order A ALLOCATED', orderA.status === 201 || orderA.status === 200, JSON.stringify(orderA.data).slice(0, 120));
  check('A delivered [$50, $30]', JSON.stringify(orderA.data?.allocation) === JSON.stringify(['$50', '$30']), JSON.stringify(orderA.data?.allocation));
  console.log(`  delivery link A: ${orderA.data?.delivery_link}`);

  // ── Scenario B: plain $10 order ──
  section('B · Client orders a $10 code');
  const orderB = await api('POST', '/merchant/dashboard/fulfillment', {
    token: merch,
    body: { product_id: psnUsa.id, amount: 10, currency: 'USD', customer_email: GMAIL, customer_name: 'Ashir Qureshi', reference_id: `qa-mail-B-${stamp}` },
  });
  check('order B ALLOCATED', orderB.status === 201 || orderB.status === 200, JSON.stringify(orderB.data).slice(0, 120));
  check('B delivered [$10]', JSON.stringify(orderB.data?.allocation) === JSON.stringify(['$10']), JSON.stringify(orderB.data?.allocation));
  console.log(`  delivery link B: ${orderB.data?.delivery_link}`);

  // ── Scenario C: $50 requested, none left -> fallback $25 + $25 ──
  section('C · $50 ordered but $50 out of stock -> fallback');
  const orderC = await api('POST', '/merchant/dashboard/fulfillment', {
    token: merch,
    body: { product_id: psnUsa.id, amount: 50, currency: 'USD', customer_email: GMAIL, customer_name: 'Ashir Qureshi', reference_id: `qa-mail-C-${stamp}` },
  });
  check('order C ALLOCATED via fallback', orderC.status === 201 || orderC.status === 200, JSON.stringify(orderC.data).slice(0, 120));

  const fidC = orderC.data?.fulfillment_id;
  if (!fidC) {
    check('C delivered exactly TWO codes', false, 'order C failed — no fulfillment id');
    console.log('\n════════════════════════════');
    console.log(`RESULT: ${pass} passed, ${fail} failed`);
    console.log('════════════════════════════');
    await prisma.$disconnect();
    process.exit(1);
  }
  const frC = await prisma.fulfillmentRequest.findUnique({ where: { id: fidC }, include: { allocations: true } });
  const idsC = JSON.parse(frC.allocations[0]?.codeItemIds || '[]');
  const codesC = await prisma.codeItem.findMany({ where: { id: { in: idsC } }, include: { denomination: true } });
  check('C delivered exactly TWO codes', idsC.length === 2, String(idsC.length));
  check('C both are $25 codes ($25+$25)', codesC.length === 2 && codesC.every((c) => Number(c.denomination.faceValue) === 25), codesC.map((c) => `$${c.denomination.faceValue}`).join(','));
  console.log(`  delivery link C: ${orderC.data?.delivery_link}`);

  // ── Wallet math ──
  section('Wallet credit/debit audit');
  w = (await api('GET', '/merchant/dashboard/wallet', { token: merch })).data;
  const endBal = Number(w.balance ?? 0);
  check('balance 500 - 80 - 10 - 50 = 360', endBal === 360, `balance=${endBal}`);
  const txns = await prisma.walletTransaction.findMany({
    where: { merchantId, type: 'DEBIT', createdAt: { gte: t0 } },
    orderBy: { createdAt: 'asc' },
  });
  const debits = txns.map((t) => Number(t.amount));
  check('3 DEBIT transactions recorded', debits.length === 3 && JSON.stringify(debits.sort((a, b) => b - a)) === '[80,50,10]', JSON.stringify(debits));

  // ── Emails ──
  section(`Emails to ${GMAIL}`);
  const mails = await waitForEmails(t0, 6, 'orders');
  check('emails generated for all 3 orders (>=3)', mails.length >= 3, `${mails.length} logged`);
  const sent = mails.filter((m) => m.status === 'SENT');
  check('all emails SENT via SendGrid', sent.length === mails.length && mails.length > 0, `${sent.length}/${mails.length} SENT`);
  for (const m of mails) {
    console.log(`  • [${m.status}] ${m.subject}`);
    if (m.status === 'FAILED' && m.errorMessage) console.log(`     error: ${m.errorMessage.slice(0, 160)}`);
  }
  if (mails.length === 0) console.log('  (no emails yet — SendGrid may be slow or rejected; see EmailLog table)');

  console.log('\n════════════════════════════');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('════════════════════════════');
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
