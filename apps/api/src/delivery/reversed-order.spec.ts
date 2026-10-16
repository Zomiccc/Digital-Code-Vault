// Run: node -r ts-node/register/transpile-only --test src/delivery/reversed-order.spec.ts
// Reversing an order puts its codes back on sale. Its delivery link used to keep
// working, so opening it afterwards handed those codes out again — found on the
// live site, where a reversed test order's link still revealed both codes.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeliveryService } from './delivery.service';

function serviceFor(fulfillmentStatus: string, allocationStatus: string) {
  const writes: string[] = [];
  const prisma: any = {
    deliveryToken: {
      findUnique: async () => ({
        id: 'tok', fulfillmentId: 'f1', revealedAt: null,
        fulfillment: {
          status: fulfillmentStatus,
          product: { name: 'P' },
          allocations: [{ id: 'a1', status: allocationStatus, codeItemIds: JSON.stringify(['c1']) }],
        },
      }),
      update: async () => { writes.push('token'); },
    },
    codeItem: {
      findMany: async () => [{ id: 'c1', encryptedCode: 'x', denomination: { faceValue: 10, currency: 'USD' } }],
      updateMany: async () => { writes.push('codes'); },
    },
    fulfillmentRequest: { update: async () => { writes.push('fulfillment'); } },
    $transaction: async (fn: any) => fn(prisma),
  };
  const encryption: any = { hashToken: () => 'hash', decrypt: () => 'CODE-1' };
  const audit: any = { log: async () => {} };
  const service = new DeliveryService(prisma, encryption, audit, {} as any, {} as any, { get: () => undefined } as any);
  return { service, writes };
}

test('a reversed order\'s link refuses to reveal and spends nothing', async () => {
  const { service, writes } = serviceFor('REVERSED', 'REVERSED');
  await assert.rejects(service.revealCode('t'), (err: any) => err.getStatus() === 410);
  assert.deepEqual(writes, []);
});

test('a reversed allocation is refused even if the order row lags behind', async () => {
  const { service } = serviceFor('ALLOCATED', 'REVERSED');
  await assert.rejects(service.revealCode('t'), (err: any) => err.getStatus() === 410);
});
