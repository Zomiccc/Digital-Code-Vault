/**
 * E2E test #4 — Add Funds flow (Stripe removed)
 *   1. Merchant fetches admin payment details (EasyPaisa/bank accounts)
 *   2. Merchant submits funding request with amount + payment screenshot
 *   3. Screenshot + message appear on the support thread (admin inbox shows unread)
 *   4. Admin approves -> merchant wallet credited, admin wallet debited
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000/api/v1';
const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, 'apps/api/prisma/dev.db') } } });

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

// tiny valid PNG (1x1 red pixel) as base64 data URL — simulates a screenshot upload
const SCREENSHOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
  console.log('E2E #4 — Add Funds via EasyPaisa/bank + chat approval\n=====================================================');
  const stamp = Date.now();

  section('Setup');
  const adminLogin = await api('POST', '/auth/admin/login', { body: { email: env.ADMIN_BOOTSTRAP_EMAIL, password: env.ADMIN_BOOTSTRAP_PASSWORD } });
  check('admin login', adminLogin.status === 200 && !!adminLogin.data?.access_token);
  const admin = adminLogin.data.access_token;

  // ensure admin wallet has funds for the payout
  await api('POST', '/admin/wallet/initialize', { token: admin, body: { amount: 1000, description: 'test float' } }).catch(() => {});
  const adminWalletBefore = Number((await prisma.adminWallet.findFirst()).balance);

  // fresh QA merchant
  const qaEmail = `qa-funds-${stamp}@test.com`;
  await api('POST', '/admin/merchants', { token: admin, body: { name: 'QA Funds Merchant', email: qaEmail, password: 'Test1234!x' } });
  const mTok = await api('POST', '/auth/merchant/login', { body: { email: qaEmail, password: 'Test1234!x' } });
  check('merchant login', mTok.status === 200 && !!mTok.data?.user?.merchantId, `HTTP ${mTok.status}`);
  const merch = mTok.data.access_token;
  const merchantId = mTok.data.user.merchantId;
  const balanceBefore = Number(mTok.data.user.merchant?.walletBalance ?? 0);

  // ── Step 1: merchant views admin payment details ──
  section('Step 1 · Merchant sees EasyPaisa / bank details');
  const details = await api('GET', '/merchant/dashboard/payment-details', { token: merch });
  check('payment details endpoint works', details.status === 200, `HTTP ${details.status}`);
  check('EasyPaisa account shown', !!details.data?.easypaisa?.accountNumber, details.data?.easypaisa?.accountNumber || '');
  check('bank accounts shown', (details.data?.bankAccounts || []).length >= 2, (details.data?.bankAccounts || []).map((b) => b.bank).join(', '));

  // ── Step 2: merchant submits funding request with proof ──
  section('Step 2 · Merchant sends $75 + screenshot via Add Funds');
  const fundReq = await api('POST', '/merchant/dashboard/funding-requests', {
    token: merch,
    body: { amount: 75, note: 'Sent from my EasyPaisa app — please approve', screenshot: SCREENSHOT },
  });
  check('funding request created PENDING', fundReq.status === 201 || fundReq.status === 200 ? true : false, JSON.stringify(fundReq.data).slice(0, 100));
  check('request status is PENDING', fundReq.data?.status === 'PENDING');

  const rejected = await api('POST', '/merchant/dashboard/funding-requests', {
    token: merch,
    body: { amount: 10, note: 'no proof attached' },
  });
  check('request WITHOUT screenshot rejected', rejected.status >= 400, `HTTP ${rejected.status}`);

  // ── Step 3: proof lands on the support thread; admin sees it ──
  section('Step 3 · Support thread carries message + proof to admin');
  const thread = await api('GET', '/merchant/support/messages', { token: merch });
  const withImage = (thread.data || []).find((m) => m.image === SCREENSHOT && m.fundingRequestId === fundReq.data.id);
  check('merchant thread contains proof message', !!withImage, `${(thread.data || []).length} message(s)`);

  const threads = await api('GET', '/admin/support/threads', { token: admin });
  const qaThread = (threads.data || []).find((t) => t.merchantId === merchantId);
  check('admin inbox lists merchant as UNREAD', !!qaThread && qaThread.unreadCount > 0, qaThread ? `unread=${qaThread.unreadCount}` : 'not found');

  const adminThread = await api('GET', `/admin/support/threads/${merchantId}`, { token: admin });
  check('admin can open thread and view image', (adminThread.data?.messages || []).some((m) => !!m.image));

  // admin replies in chat
  const reply = await api('POST', `/admin/support/threads/${merchantId}/messages`, { token: admin, body: { body: 'Verifying your transfer now...' } });
  check('admin reply posted', reply.status === 201 || reply.status === 200);
  const merchThreadAfter = await api('GET', '/merchant/support/messages', { token: merch });
  check('merchant sees admin reply', (merchThreadAfter.data || []).some((m) => m.senderRole === 'ADMIN'));

  // ── Step 4: admin verifies & approves → wallet credited ──
  section('Step 4 · Admin approves funding');
  const list = await api('GET', '/admin/wallet/funding-requests?status=PENDING', { token: admin });
  const target = (Array.isArray(list.data) ? list.data : list.data?.items || []).find((r) => r.id === fundReq.data.id);
  check('pending request visible to admin WITH proof', !!target && !!target.has_screenshot && !!target.screenshot);

  const approved = await api('POST', `/admin/wallet/funding-requests/${fundReq.data.id}/approve`, { token: admin, body: { note: 'Transfer verified' } });
  check('approval succeeded', approved.status === 201 || approved.status === 200, JSON.stringify(approved.data).slice(0, 100));

  const walletAfter = await api('GET', '/merchant/dashboard/wallet', { token: merch });
  const balanceAfter = Number(walletAfter.data?.balance ?? 0);
  check(`merchant wallet credited 0 -> 75`, balanceBefore === 0 && balanceAfter === 75, `balance=${balanceAfter}`);

  const adminWalletAfter = Number((await prisma.adminWallet.findFirst()).balance);
  check('admin wallet debited by 75', adminWalletBefore - adminWalletAfter === 75, `${adminWalletBefore} -> ${adminWalletAfter}`);

  const doubleApprove = await api('POST', `/admin/wallet/funding-requests/${fundReq.data.id}/approve`, { token: admin, body: {} });
  check('double-approve blocked', doubleApprove.status >= 400, `HTTP ${doubleApprove.status}`);

  console.log('\n════════════════════════════');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('════════════════════════════');
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
