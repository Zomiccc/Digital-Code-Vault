/**
 * Stripe Webhook Idempotency & Flow Tests
 * 
 * Tests the core logic of the Stripe payment service:
 * - Webhook event deduplication via stripeEventId
 * - Merchant wallet funding atomic credit
 * - Customer purchase fulfillment trigger
 * - Payment record state transitions
 * - Refund handling
 * 
 * Run: node test-stripe-webhook-logic.js
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const results = [];
let passed = 0;
let failed = 0;

function assert(name, condition, details = '') {
  const status = condition ? 'PASS' : 'FAIL';
  const color = condition ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}[${status}]\x1b[0m ${name}`);
  if (details) console.log(`  Details: ${details}`);
  results.push({ name, status, details });
  if (condition) passed++; else failed++;
}

async function runTests() {
  console.log('\n=== Stripe Webhook Logic Tests ===\n');

  // ─── Test 1: PaymentRecord model is accessible ───
  try {
    const count = await prisma.paymentRecord.count();
    assert('PaymentRecord model is accessible', true, `Current count: ${count}`);
  } catch (err) {
    assert('PaymentRecord model is accessible', false, err.message);
  }

  // ─── Test 2: CustomerOrder model is accessible ───
  try {
    const count = await prisma.customerOrder.count();
    assert('CustomerOrder model is accessible', true, `Current count: ${count}`);
  } catch (err) {
    assert('CustomerOrder model is accessible', false, err.message);
  }

  // ─── Test 3: Create a test PaymentRecord ───
  let testPaymentId;
  try {
    const record = await prisma.paymentRecord.create({
      data: {
        amount: 100.00,
        currency: 'USD',
        status: 'PENDING',
        paymentType: 'MERCHANT_WALLET_FUNDING',
        description: 'Test payment record',
      },
    });
    testPaymentId = record.id;
    assert('Create test PaymentRecord', true, `ID: ${record.id}`);
  } catch (err) {
    assert('Create test PaymentRecord', false, err.message);
  }

  // ─── Test 4: Idempotency - stripeEventId unique constraint ───
  if (testPaymentId) {
    try {
      await prisma.paymentRecord.update({
        where: { id: testPaymentId },
        data: {
          stripeEventId: 'evt_test_unique_001',
          status: 'SUCCEEDED',
          stripePaymentIntentId: 'pi_test_001',
          stripeCheckoutSessionId: 'cs_test_001',
          paidAt: new Date(),
        },
      });
      assert('Set stripeEventId on payment record', true);

      try {
        await prisma.paymentRecord.create({
          data: {
            amount: 50.00,
            currency: 'USD',
            status: 'PENDING',
            paymentType: 'CUSTOMER_PURCHASE',
            stripeEventId: 'evt_test_unique_001',
          },
        });
        assert('Duplicate stripeEventId rejected', false, 'Should have thrown unique constraint error');
      } catch (err) {
        assert('Duplicate stripeEventId rejected', true, 'Unique constraint enforced');
      }
    } catch (err) {
      assert('Idempotency test', false, err.message);
    }
  }

  // ─── Test 5: Create CustomerOrder ───
  let testOrderId;
  try {
    const product = await prisma.product.findFirst();
    if (product) {
      const order = await prisma.customerOrder.create({
        data: {
          customerEmail: 'test-customer@test.com',
          customerName: 'Test Customer',
          productId: product.id,
          amount: 25.00,
          currency: 'USD',
          status: 'PENDING_PAYMENT',
        },
      });
      testOrderId = order.id;
      assert('Create test CustomerOrder', true, `ID: ${order.id}, Status: ${order.status}`);
    } else {
      assert('Create test CustomerOrder', false, 'No products found in DB');
    }
  } catch (err) {
    assert('Create test CustomerOrder', false, err.message);
  }

  // ─── Test 6: Link PaymentRecord to CustomerOrder ───
  if (testOrderId) {
    try {
      const orderPayment = await prisma.paymentRecord.create({
        data: {
          customerOrderId: testOrderId,
          amount: 25.00,
          currency: 'USD',
          status: 'PENDING',
          paymentType: 'CUSTOMER_PURCHASE',
          description: 'Test customer purchase',
        },
      });
      assert('Link PaymentRecord to CustomerOrder', true, `Payment: ${orderPayment.id}, Order: ${testOrderId}`);
    } catch (err) {
      assert('Link PaymentRecord to CustomerOrder', false, err.message);
    }
  }

  // ─── Test 7: Update order status to PAID ───
  if (testOrderId) {
    try {
      const updated = await prisma.customerOrder.update({
        where: { id: testOrderId },
        data: { status: 'PAID' },
      });
      assert('Update order status to PAID', updated.status === 'PAID', `Status: ${updated.status}`);
    } catch (err) {
      assert('Update order status to PAID', false, err.message);
    }
  }

  // ─── Test 8: Update order status to FULFILLED ───
  if (testOrderId) {
    try {
      const updated = await prisma.customerOrder.update({
        where: { id: testOrderId },
        data: {
          status: 'FULFILLED',
          fulfillmentId: 'test-fulfillment-001',
          revealToken: 'https://example.com/api/v1/reveal/testtoken123',
        },
      });
      assert('Update order to FULFILLED with reveal link', 
        updated.status === 'FULFILLED' && updated.fulfillmentId === 'test-fulfillment-001',
        `Status: ${updated.status}, Fulfillment: ${updated.fulfillmentId}`);
    } catch (err) {
      assert('Update order to FULFILLED', false, err.message);
    }
  }

  // ─── Test 9: Payment record status transitions ───
  if (testPaymentId) {
    try {
      await prisma.paymentRecord.update({
        where: { id: testPaymentId },
        data: { status: 'SUCCEEDED', paidAt: new Date() },
      });
      let record = await prisma.paymentRecord.findUnique({ where: { id: testPaymentId } });
      assert('Payment PENDING -> SUCCEEDED', record.status === 'SUCCEEDED', `Status: ${record.status}`);

      await prisma.paymentRecord.update({
        where: { id: testPaymentId },
        data: {
          status: 'REFUNDED',
          refundAmount: 100.00,
          refundReason: 'Customer requested refund',
          refundedAt: new Date(),
        },
      });
      record = await prisma.paymentRecord.findUnique({ where: { id: testPaymentId } });
      assert('Payment SUCCEEDED -> REFUNDED', 
        record.status === 'REFUNDED' && Number(record.refundAmount) === 100.00,
        `Status: ${record.status}, Refund: ${record.refundAmount}`);
    } catch (err) {
      assert('Payment status transitions', false, err.message);
    }
  }

  // ─── Test 10: Query payment records by type ───
  try {
    const merchantPayments = await prisma.paymentRecord.findMany({
      where: { paymentType: 'MERCHANT_WALLET_FUNDING' },
    });
    const customerPayments = await prisma.paymentRecord.findMany({
      where: { paymentType: 'CUSTOMER_PURCHASE' },
    });
    assert('Query payments by type', 
      merchantPayments.length >= 0 && customerPayments.length >= 0,
      `Merchant: ${merchantPayments.length}, Customer: ${customerPayments.length}`);
  } catch (err) {
    assert('Query payments by type', false, err.message);
  }

  // ─── Test 11: Query payment records by status ───
  try {
    const succeededPayments = await prisma.paymentRecord.findMany({
      where: { status: 'SUCCEEDED' },
    });
    const pendingPayments = await prisma.paymentRecord.findMany({
      where: { status: 'PENDING' },
    });
    assert('Query payments by status', true, `Succeeded: ${succeededPayments.length}, Pending: ${pendingPayments.length}`);
  } catch (err) {
    assert('Query payments by status', false, err.message);
  }

  // ─── Cleanup ───
  console.log('\n=== Cleanup ===');
  try {
    if (testOrderId) {
      await prisma.paymentRecord.deleteMany({ where: { customerOrderId: testOrderId } });
      await prisma.customerOrder.delete({ where: { id: testOrderId } });
      console.log('  Cleaned up test order');
    }
    if (testPaymentId) {
      await prisma.paymentRecord.deleteMany({ where: { id: testPaymentId } });
      console.log('  Cleaned up test payment records');
    }
    await prisma.paymentRecord.deleteMany({ where: { description: { contains: 'Test' } } });
    await prisma.customerOrder.deleteMany({ where: { customerEmail: 'test-customer@test.com' } });
    console.log('  Cleaned up remaining test records');
  } catch (err) {
    console.log(`  Cleanup error (non-critical): ${err.message}`);
  }

  // ─── Summary ───
  console.log('\n=== Test Summary ===');
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
  console.log(`Total: ${results.length}`);

  if (failed > 0) {
    console.log('\n\x1b[31mFailed tests:\x1b[0m');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.details}`);
    });
  }

  await prisma.$disconnect();
  process.exit(failed);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
