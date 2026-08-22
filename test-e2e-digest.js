/**
 * E2E test #3 — Consolidated digest email
 * One customer orders 3 things rapidly -> receives ONE email listing all 3 items
 * (not 3 separate emails).
 *
 * Requires EMAIL_DIGEST_WINDOW_SECONDS=10 in .env (test speed).
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
  try { return { status: res.status, data: await res.json() }; } catch { return { status: res.status, data: null }; }
}

async function main() {
  console.log('E2E #3 — Consolidated digest email (3 orders -> 1 email)\n========================================================');

  section('Setup');
  const adminLogin = await api('POST', '/auth/admin/login', { body: { email: env.ADMIN_BOOTSTRAP_EMAIL, password: env.ADMIN_BOOTSTRAP_PASSWORD } });
  const admin = adminLogin.data.access_token;

  const hierarchy = (await api('GET', '/admin/catalog/hierarchy', { token: admin })).data;
  const psnUsa = hierarchy.flatMap((c) => c.products).find((p) => p.name === 'PlayStation USA Digital Code');
  const denoms = {};
  for (const v of [10, 20, 30, 50]) {
    denoms[v] = psnUsa.denominations.find((d) => Number(d.faceValue) === v && d.currency === 'USD');
    check(`$${v} denomination exists`, !!denoms[v]);
  }
  const variants = psnUsa.productRegions.flatMap((pr) => pr.variants);
  const v1m = variants.find((v) => v.name === 'PS Essential: 1 Month');
  const v3m = variants.find((v) => v.name === 'PS Essential: 3 Months');

  // hermetic stock
  for (const denom of Object.values(denoms)) {
    const listed = await api('GET', `/admin/codes?denominationId=${denom.id}&status=AVAILABLE&limit=500`, { token: admin });
    const rows = Array.isArray(listed.data) ? listed.data : listed.data?.items || listed.data?.data || [];
    for (const row of rows) {
      if (row.status === 'AVAILABLE') await api('POST', `/admin/codes/${row.id}/void`, { token: admin, body: {} }).catch(() => {});
    }
  }
  const stamp = Date.now();
  const uploads = [
    [denoms[10], [`QA10-${stamp}-D`, `QA10-${stamp}-E`]],
    [denoms[20], [`QA20-${stamp}-C`]],
    [denoms[30], [`QA30-${stamp}-B`]],
    [denoms[50], [`QA50-${stamp}-B`]],
  ];
  for (const [denom, codes] of uploads) {
    const up = await api('POST', '/admin/codes/bulk-upload', { token: admin, body: { denomination_id: denom.id, codes } });
    check(`stock upload (${codes.length} codes)`, up.status === 200 || up.status === 201);
  }

  // merchant
  let mTok = await api('POST', '/auth/merchant/login', { body: { email: 'merchant@test.com', password: 'Test1234!' } });
  if (!(mTok.status === 200 && mTok.data?.user?.merchantId)) {
    const qaEmail = `qa-digest-${stamp}@test.com`;
    await api('POST', '/admin/merchants', { token: admin, body: { name: 'QA Digest Merchant', email: qaEmail, password: 'Test1234!x' } });
    mTok = await api('POST', '/auth/merchant/login', { body: { email: qaEmail, password: 'Test1234!x' } });
  }
  const merch = mTok.data.access_token;
  const merchantId = mTok.data.user.merchantId;
  await api('POST', `/admin/merchants/${merchantId}/wallet/credit`, { token: admin, body: { amount: 500 } });

  section('Customer orders 3 things back-to-back');
  const t0 = new Date();
  const mkBody = (extra) => ({ customer_email: GMAIL, customer_name: 'Ashir Qureshi', ...extra });
  // fire all three without waiting — simulates one shopping session
  const results = await Promise.allSettled([
    api('POST', '/merchant/dashboard/fulfillment', { token: merch, body: mkBody({ product_id: psnUsa.id, amount: 30, currency: 'USD', variant_id: v1m.id, reference_id: `dg-A-${stamp}` }) }),
    new Promise((res) => setTimeout(() => res(api('POST', '/merchant/dashboard/fulfillment', { token: merch, body: mkBody({ product_id: psnUsa.id, amount: 10, currency: 'USD', reference_id: `dg-B-${stamp}` }) })), 400)),
    new Promise((res) => setTimeout(() => res(api('POST', '/merchant/dashboard/fulfillment', { token: merch, body: mkBody({ product_id: psnUsa.id, amount: 80, currency: 'USD', variant_id: v3m.id, reference_id: `dg-C-${stamp}` }) })), 800)),
  ]);
  const orders = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
  check('order A allocated', !!orders[0]?.data?.delivery_link, JSON.stringify(orders[0]?.data || orders[0]?.reason).slice(0, 90));
  check('order B allocated', !!orders[1]?.data?.delivery_link, JSON.stringify(orders[1]?.data || orders[1]?.reason).slice(0, 90));
  check('order C allocated', !!orders[2]?.data?.delivery_link, JSON.stringify(orders[2]?.data || orders[2]?.reason).slice(0, 90));

  section(`Waiting for digest window to close (10s)...`);
  let mails = [];
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    mails = await prisma.emailLog.findMany({
      where: { recipient: GMAIL, createdAt: { gte: t0 } },
      orderBy: { createdAt: 'asc' },
    });
    if (mails.length >= 1 && mails.every((m) => m.status === 'SENT' || m.status === 'FAILED')) break;
    await new Promise((r) => setTimeout(r, 1500));
  }

  section('Email verification');
  check('EXACTLY ONE email received (not 3)', mails.length === 1, `${mails.length} email(s): ${mails.map((m) => `"${m.subject}"`).join(', ')}`);
  check('subject lists all 3 codes', /Your 3 Digital Codes are Ready/.test(mails[0]?.subject || ''), `"${mails[0]?.subject}"`);
  check('digest template used', mails[0]?.template === 'order-digest');
  check('email SENT via provider', mails[0]?.status === 'SENT', mails[0]?.providerResponse || '');

  const w = (await api('GET', '/merchant/dashboard/wallet', { token: merch })).data;
  check('wallet debited 500-120=380', Number(w.balance ?? 0) === 380, `balance=${w.balance}`);

  console.log('\n════════════════════════════');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('════════════════════════════');
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
