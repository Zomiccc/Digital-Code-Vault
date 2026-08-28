import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const orderId = '7350';

  // 1. Find FulfillmentRequest(s) for this order
  const reqs = await prisma.fulfillmentRequest.findMany({
    where: { referenceId: orderId },
    include: { allocations: true, deliveryToken: true, product: true, walletTxn: true },
    orderBy: { createdAt: 'desc' },
  });

  console.log('=== FulfillmentRequest(s) for order', orderId, '===');
  for (const r of reqs) {
    console.log({
      id: r.id,
      status: r.status,
      amount: r.amount,
      currency: r.currency,
      failureReason: (r as any).failureReason,
      productId: r.productId,
      productName: r.product?.name,
      walletCharged: (r as any).walletCharged,
      inventorySource: (r as any).inventorySource,
      idempotencyKey: r.idempotencyKey,
      createdAt: r.createdAt,
      allocations: r.allocations?.length || 0,
      hasWalletTxn: !!r.walletTxn,
      hasDeliveryToken: !!r.deliveryToken,
    });
  }

  // 2. Find IncomingWebhook(s) for this order
  const webhooks = await prisma.incomingWebhook.findMany({
    where: { orderId: orderId },
    orderBy: { createdAt: 'desc' },
  });

  console.log('\n=== IncomingWebhook(s) for order', orderId, '===');
  for (const w of webhooks) {
    console.log({
      id: w.id,
      processingStatus: w.processingStatus,
      errorMessage: w.errorMessage,
      eventId: w.eventId,
      amount: w.amount,
      currency: w.currency,
      paymentStatus: w.paymentStatus,
      productSku: w.productSku,
      productName: w.productName,
      createdAt: w.createdAt,
    });
  }

  // 3. Check audit logs
  const audits = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityId: orderId },
        { entityId: { in: reqs.map(r => r.id) } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log('\n=== AuditLog(s) ===');
  for (const a of audits) {
    console.log({
      id: a.id,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      metadata: a.metadata,
      createdAt: a.createdAt,
    });
  }

  // 4. Check product denominations
  if (reqs.length > 0) {
    const productId = reqs[0].productId;
    const denominations = await prisma.denomination.findMany({
      where: { productId },
      include: {
        codeItems: {
          where: { status: 'AVAILABLE' },
          take: 1,
          select: { id: true },
        },
      },
    });
    console.log('\n=== Denominations for product', productId, '===');
    for (const d of denominations) {
      console.log({
        id: d.id,
        faceValue: d.faceValue,
        currency: d.currency,
        availableCodes: d.codeItems.length,
      });
    }
  }

  // 5. Check merchant wallet
  if (reqs.length > 0) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: reqs[0].merchantId },
      select: { id: true, name: true, walletBalance: true, status: true, email: true },
    });
    console.log('\n=== Merchant state ===');
    console.log(merchant);
  }

  // 6. Check email logs for this merchant's recent orders
  const recentEmails = await prisma.emailLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  console.log('\n=== Recent EmailLog entries (last 20) ===');
  for (const e of recentEmails) {
    console.log({
      id: e.id,
      recipient: e.recipient,
      subject: e.subject,
      template: e.template,
      status: e.status,
      errorMessage: e.errorMessage,
      providerResponse: e.providerResponse,
      retryCount: e.retryCount,
      createdAt: e.createdAt,
      sentAt: e.sentAt,
    });
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
