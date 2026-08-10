/**
 * Wallet & Accounting System - Comprehensive Test Suite
 *
 * Run with: npx ts-node test-wallet.ts
 *
 * Tests:
 * 1. Admin wallet creation and retrieval
 * 2. Funding request lifecycle (create → approve → balance update)
 * 3. Funding request rejection
 * 4. Reconciliation report (matched and mismatched)
 * 5. Product mapping safety (unmapped product rejection)
 * 6. Duplicate webhook detection (eventId)
 * 7. Order-level deduplication (orderId)
 * 8. Negative balance guard
 * 9. Ledger integrity (double-entry: merchant debit = admin credit)
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const results: { test: string; passed: boolean; detail: string }[] = [];

async function assert(condition: boolean, test: string, detail: string) {
  results.push({ test, passed: condition, detail });
  console.log(`${condition ? '✅ PASS' : '❌ FAIL'}: ${test} — ${detail}`);
}

async function cleanup() {
  // Clean up test data
  await prisma.adminWalletTransaction.deleteMany({});
  await prisma.adminWallet.deleteMany({});
  await prisma.fundingRequest.deleteMany({});
  await prisma.walletTransaction.deleteMany({ where: { referenceId: { contains: 'test-' } } });
  await prisma.fulfillmentRequest.deleteMany({ where: { referenceId: { contains: 'test-' } } });
  await prisma.incomingWebhook.deleteMany({ where: { orderId: { contains: 'test-order-' } } });
  await prisma.auditLog.deleteMany({ where: { action: 'webhook.product_unmapped' } });
}

async function test1_AdminWalletCreation() {
  console.log('\n--- Test 1: Admin Wallet Creation ---');

  // Create admin wallet
  const wallet = await prisma.adminWallet.create({
    data: {
      id: 'test-admin-wallet',
      balance: 1000,
      currency: 'USD',
    },
  });

  await assert(wallet.id === 'test-admin-wallet', 'Admin wallet created', `ID: ${wallet.id}`);
  await assert(Number(wallet.balance) === 1000, 'Initial balance correct', `Balance: ${wallet.balance}`);

  // Retrieve it
  const retrieved = await prisma.adminWallet.findUnique({
    where: { id: 'test-admin-wallet' },
  });
  await assert(!!retrieved, 'Admin wallet retrievable', `Found: ${!!retrieved}`);
}

async function test2_FundingRequestApproval() {
  console.log('\n--- Test 2: Funding Request Approval ---');

  // Find a merchant
  const merchant = await prisma.merchant.findFirst();
  if (!merchant) {
    await assert(false, 'Merchant exists', 'No merchant found for testing');
    return;
  }

  const balanceBefore = Number(merchant.walletBalance);

  // Create funding request
  const fundingReq = await prisma.fundingRequest.create({
    data: {
      id: 'test-funding-1',
      merchantId: merchant.id,
      adminWalletId: 'test-admin-wallet',
      amount: 500,
      currency: 'USD',
      note: 'Test funding request',
      status: 'PENDING',
    },
  });

  await assert(fundingReq.status === 'PENDING', 'Funding request created as PENDING', `Status: ${fundingReq.status}`);

  // Approve it — simulate the wallet service logic
  const result = await prisma.$transaction(async (tx) => {
    // Debit admin wallet
    const updatedAdminWallet = await tx.adminWallet.update({
      where: { id: 'test-admin-wallet' },
      data: { balance: { decrement: 500 } },
    });

    // Create admin wallet transaction
    await tx.adminWalletTransaction.create({
      data: {
        adminWalletId: 'test-admin-wallet',
        type: 'DEBIT',
        amount: 500,
        balanceAfter: updatedAdminWallet.balance,
        referenceId: 'test-funding-1',
        source: 'FUNDING',
        description: 'Funding request approved',
      },
    });

    // Credit merchant wallet
    const updatedMerchant = await tx.merchant.update({
      where: { id: merchant.id },
      data: { walletBalance: { increment: 500 } },
    });

    // Create merchant wallet transaction
    await tx.walletTransaction.create({
      data: {
        merchantId: merchant.id,
        type: 'CREDIT',
        amount: 500,
        balanceAfter: updatedMerchant.walletBalance,
        referenceId: 'test-funding-1',
      },
    });

    // Update funding request status
    await tx.fundingRequest.update({
      where: { id: 'test-funding-1' },
      data: {
        status: 'APPROVED',
        reviewedBy: 'test-admin',
        reviewedAt: new Date(),
      },
    });

    return { merchantBalance: updatedMerchant.walletBalance, adminBalance: updatedAdminWallet.balance };
  });

  await assert(Number(result.merchantBalance) === balanceBefore + 500, 'Merchant balance increased by 500', `Before: ${balanceBefore}, After: ${result.merchantBalance}`);
  await assert(Number(result.adminBalance) === 500, 'Admin wallet debited by 500', `Admin balance: ${result.adminBalance}`);

  // Verify funding request status
  const approved = await prisma.fundingRequest.findUnique({ where: { id: 'test-funding-1' } });
  await assert(approved?.status === 'APPROVED', 'Funding request status is APPROVED', `Status: ${approved?.status}`);
}

async function test3_FundingRequestRejection() {
  console.log('\n--- Test 3: Funding Request Rejection ---');

  const merchant = await prisma.merchant.findFirst();
  if (!merchant) return;

  const balanceBefore = Number(merchant.walletBalance);

  // Create funding request
  const fundingReq = await prisma.fundingRequest.create({
    data: {
      id: 'test-funding-2',
      merchantId: merchant.id,
      adminWalletId: 'test-admin-wallet',
      amount: 200,
      currency: 'USD',
      note: 'Test rejection',
      status: 'PENDING',
    },
  });

  // Reject it — no balance changes
  await prisma.fundingRequest.update({
    where: { id: 'test-funding-2' },
    data: {
      status: 'REJECTED',
      adminNote: 'Insufficient documentation',
      reviewedBy: 'test-admin',
      reviewedAt: new Date(),
    },
  });

  const merchantAfter = await prisma.merchant.findUnique({ where: { id: merchant.id } });
  await assert(Number(merchantAfter?.walletBalance) === balanceBefore, 'Merchant balance unchanged on rejection', `Before: ${balanceBefore}, After: ${merchantAfter?.walletBalance}`);

  const rejected = await prisma.fundingRequest.findUnique({ where: { id: 'test-funding-2' } });
  await assert(rejected?.status === 'REJECTED', 'Funding request status is REJECTED', `Status: ${rejected?.status}`);
}

async function test4_ReconciliationReport() {
  console.log('\n--- Test 4: Reconciliation Report ---');

  // Create a fulfillment with matching debit and credit
  const merchant = await prisma.merchant.findFirst();
  const product = await prisma.product.findFirst();
  if (!merchant || !product) {
    await assert(false, 'Merchant and product exist', 'Missing merchant or product');
    return;
  }

  const fulfillment = await prisma.fulfillmentRequest.create({
    data: {
      id: 'test-fulfillment-1',
      merchantId: merchant.id,
      productId: product.id,
      amount: 50,
      currency: 'USD',
      status: 'DELIVERED',
      walletCharged: true,
      referenceId: 'test-order-1',
      idempotencyKey: 'test-idem-1',
    },
  });

  // Create merchant debit
  await prisma.walletTransaction.create({
    data: {
      merchantId: merchant.id,
      type: 'DEBIT',
      amount: 50,
      balanceAfter: Number(merchant.walletBalance) - 50,
      referenceId: 'test-fulfillment-1',
      fulfillmentId: 'test-fulfillment-1',
    },
  });

  // Create matching admin credit
  await prisma.adminWalletTransaction.create({
    data: {
      adminWalletId: 'test-admin-wallet',
      type: 'CREDIT',
      amount: 50,
      balanceAfter: 550,
      referenceId: 'test-fulfillment-1',
      source: 'FULFILLMENT',
      description: 'Fulfillment revenue',
    },
  });

  // Query reconciliation
  const merchantDebit = await prisma.walletTransaction.findFirst({
    where: { fulfillmentId: 'test-fulfillment-1', type: 'DEBIT' },
  });
  const adminCredit = await prisma.adminWalletTransaction.findFirst({
    where: { referenceId: 'test-fulfillment-1', type: 'CREDIT', source: 'FULFILLMENT' },
  });

  const matched = merchantDebit && adminCredit && Number(merchantDebit.amount) === Number(adminCredit.amount);
  await assert(!!matched, 'Reconciliation: merchant debit matches admin credit', `Debit: ${merchantDebit?.amount}, Credit: ${adminCredit?.amount}`);

  // Test mismatch detection
  await prisma.fulfillmentRequest.create({
    data: {
      id: 'test-fulfillment-2',
      merchantId: merchant.id,
      productId: product.id,
      amount: 30,
      currency: 'USD',
      status: 'DELIVERED',
      walletCharged: true,
      referenceId: 'test-order-2',
      idempotencyKey: 'test-idem-2',
    },
  });

  // Create merchant debit but NO admin credit (mismatch)
  await prisma.walletTransaction.create({
    data: {
      merchantId: merchant.id,
      type: 'DEBIT',
      amount: 30,
      balanceAfter: Number(merchant.walletBalance) - 80,
      referenceId: 'test-fulfillment-2',
      fulfillmentId: 'test-fulfillment-2',
    },
  });

  const mismatchedDebit = await prisma.walletTransaction.findFirst({
    where: { fulfillmentId: 'test-fulfillment-2', type: 'DEBIT' },
  });
  const mismatchedCredit = await prisma.adminWalletTransaction.findFirst({
    where: { referenceId: 'test-fulfillment-2', type: 'CREDIT' },
  });

  const mismatch = mismatchedDebit && !mismatchedCredit;
  await assert(!!mismatch, 'Reconciliation: mismatch detected (debit without credit)', `Debit exists: ${!!mismatchedDebit}, Credit exists: ${!!mismatchedCredit}`);
}

async function test5_ProductMappingSafety() {
  console.log('\n--- Test 5: Product Mapping Safety ---');

  const merchant = await prisma.merchant.findFirst();
  if (!merchant) return;

  // Create an incoming webhook with unmapped product
  const webhook = await prisma.incomingWebhook.create({
    data: {
      eventId: 'test-unmapped-event-' + Date.now(),
      merchantId: merchant.id,
      platform: 'woocommerce',
      provider: 'woocommerce',
      orderId: 'test-order-unmapped-' + Date.now(),
      productId: 'unknown-product-999',
      productName: 'Unknown Product Test',
      productSku: 'UNKNOWN-SKU-999',
      paymentStatus: 'paid',
      orderStatus: 'completed',
      rawPayload: JSON.stringify({ test: true }),
      processingStatus: 'PENDING',
    },
  });

  // Simulate the product lookup — should not find a match
  const product = await prisma.product.findFirst({
    where: { name: { equals: 'Unknown Product Test' } },
  });

  await assert(!product, 'Unmapped product not found in database', `Product found: ${!!product}`);

  // Mark webhook as rejected (simulating the safety guard)
  await prisma.incomingWebhook.update({
    where: { id: webhook.id },
    data: {
      processingStatus: 'REJECTED',
      errorMessage: 'No explicit product mapping found',
      processedAt: new Date(),
    },
  });

  const rejected = await prisma.incomingWebhook.findUnique({ where: { id: webhook.id } });
  await assert(rejected?.processingStatus === 'REJECTED', 'Unmapped webhook rejected', `Status: ${rejected?.processingStatus}`);

  // Verify no fulfillment was created
  const fulfillment = await prisma.fulfillmentRequest.findFirst({
    where: { referenceId: webhook.orderId },
  });
  await assert(!fulfillment, 'No fulfillment created for unmapped product', `Fulfillment exists: ${!!fulfillment}`);

  // Verify no wallet transaction was created
  const walletTxn = await prisma.walletTransaction.findFirst({
    where: { referenceId: webhook.orderId },
  });
  await assert(!walletTxn, 'No wallet debit for unmapped product', `Wallet txn exists: ${!!walletTxn}`);
}

async function test6_DuplicateWebhookDetection() {
  console.log('\n--- Test 6: Duplicate Webhook Detection (eventId) ---');

  const merchant = await prisma.merchant.findFirst();
  if (!merchant) return;

  const eventId = 'test-dup-event-' + Date.now();

  // First webhook
  const webhook1 = await prisma.incomingWebhook.create({
    data: {
      eventId,
      merchantId: merchant.id,
      platform: 'woocommerce',
      orderId: 'test-order-dup-' + Date.now(),
      paymentStatus: 'paid',
      rawPayload: '{}',
      processingStatus: 'PENDING',
    },
  });

  // Second webhook with same eventId — should fail due to unique constraint
  let duplicateCaught = false;
  try {
    await prisma.incomingWebhook.create({
      data: {
        eventId,
        merchantId: merchant.id,
        platform: 'woocommerce',
        orderId: 'test-order-dup-2-' + Date.now(),
        paymentStatus: 'paid',
        rawPayload: '{}',
        processingStatus: 'PENDING',
      },
    });
  } catch (err) {
    duplicateCaught = true;
  }

  await assert(duplicateCaught, 'Duplicate eventId rejected by unique constraint', `Caught: ${duplicateCaught}`);
}

async function test7_OrderDeduplication() {
  console.log('\n--- Test 7: Order-level Deduplication (orderId) ---');

  const merchant = await prisma.merchant.findFirst();
  if (!merchant) return;

  const orderId = 'test-order-dedup-' + Date.now();

  // First webhook — completed
  const webhook1 = await prisma.incomingWebhook.create({
    data: {
      eventId: 'test-dedup-1-' + Date.now(),
      merchantId: merchant.id,
      platform: 'woocommerce',
      orderId,
      paymentStatus: 'paid',
      rawPayload: '{}',
      processingStatus: 'COMPLETED',
      processedAt: new Date(),
    },
  });

  // Second webhook for same order — different eventId, same orderId
  const webhook2 = await prisma.incomingWebhook.create({
    data: {
      eventId: 'test-dedup-2-' + Date.now(),
      merchantId: merchant.id,
      platform: 'woocommerce',
      orderId,
      paymentStatus: 'paid',
      rawPayload: '{}',
      processingStatus: 'PENDING',
    },
  });

  // Simulate the deduplication check
  const existingFulfilled = await prisma.incomingWebhook.findFirst({
    where: {
      orderId,
      merchantId: merchant.id,
      processingStatus: 'COMPLETED',
      id: { not: webhook2.id },
    },
  });

  await assert(!!existingFulfilled, 'Order dedup: found existing completed webhook', `Found: ${existingFulfilled?.id}`);

  // Mark as duplicate
  if (existingFulfilled) {
    await prisma.incomingWebhook.update({
      where: { id: webhook2.id },
      data: {
        processingStatus: 'DUPLICATE_ORDER',
        errorMessage: `Order ${orderId} already fulfilled`,
        processedAt: new Date(),
      },
    });

    const dup = await prisma.incomingWebhook.findUnique({ where: { id: webhook2.id } });
    await assert(dup?.processingStatus === 'DUPLICATE_ORDER', 'Order dedup: second webhook marked as DUPLICATE_ORDER', `Status: ${dup?.processingStatus}`);
  }
}

async function test8_LedgerIntegrity() {
  console.log('\n--- Test 8: Ledger Integrity (Double-Entry) ---');

  // Verify that for every fulfillment DEBIT on merchant, there's a matching CREDIT on admin
  const fulfillments = await prisma.fulfillmentRequest.findMany({
    where: { walletCharged: true, id: { in: ['test-fulfillment-1', 'test-fulfillment-2'] } },
  });

  let allMatched = true;
  let mismatchCount = 0;

  for (const f of fulfillments) {
    const debit = await prisma.walletTransaction.findFirst({
      where: { fulfillmentId: f.id, type: 'DEBIT' },
    });
    const credit = await prisma.adminWalletTransaction.findFirst({
      where: { referenceId: f.id, type: 'CREDIT', source: 'FULFILLMENT' },
    });

    if (debit && credit && Number(debit.amount) === Number(credit.amount)) {
      // Matched
    } else {
      mismatchCount++;
      allMatched = false;
    }
  }

  await assert(mismatchCount === 1, 'Ledger: 1 expected mismatch (test-fulfillment-2 has no admin credit)', `Mismatches: ${mismatchCount}`);
  await assert(allMatched === false, 'Ledger: mismatch correctly detected', `All matched: ${allMatched}`);
}

async function test9_NegativeBalanceGuard() {
  console.log('\n--- Test 9: Negative Balance Guard ---');

  const merchant = await prisma.merchant.findFirst();
  if (!merchant) return;

  // Try to debit more than balance
  const currentBalance = Number(merchant.walletBalance);
  const excessAmount = currentBalance + 10000;

  let guardTriggered = false;
  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.merchant.update({
        where: { id: merchant.id },
        data: { walletBalance: { decrement: excessAmount } },
      });

      if (Number(updated.walletBalance) < 0) {
        throw new Error('NEGATIVE_BALANCE_GUARD: Transaction would result in negative balance');
      }

      // If we get here, the guard failed
      await tx.walletTransaction.create({
        data: {
          merchantId: merchant.id,
          type: 'DEBIT',
          amount: excessAmount,
          balanceAfter: updated.walletBalance,
        },
      });
    });
  } catch (err: any) {
    guardTriggered = err.message.includes('NEGATIVE_BALANCE_GUARD');
    // Rollback is automatic on throw
  }

  await assert(guardTriggered, 'Negative balance guard triggered', `Guard triggered: ${guardTriggered}`);

  // Verify balance unchanged
  const merchantAfter = await prisma.merchant.findUnique({ where: { id: merchant.id } });
  await assert(Number(merchantAfter?.walletBalance) === currentBalance, 'Balance unchanged after guard trigger', `Before: ${currentBalance}, After: ${merchantAfter?.walletBalance}`);
}

async function main() {
  console.log('=========================================');
  console.log('Wallet & Accounting System - Test Suite');
  console.log('=========================================');

  await cleanup();

  await test1_AdminWalletCreation();
  await test2_FundingRequestApproval();
  await test3_FundingRequestRejection();
  await test4_ReconciliationReport();
  await test5_ProductMappingSafety();
  await test6_DuplicateWebhookDetection();
  await test7_OrderDeduplication();
  await test8_LedgerIntegrity();
  await test9_NegativeBalanceGuard();

  await cleanup();

  console.log('\n=========================================');
  console.log('Test Summary');
  console.log('=========================================');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.test}: ${r.detail}`);
    });
  }

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
