// Run: node -r ts-node/register/transpile-only --test src/admin/merchant-deletion.spec.ts
// Deleting a merchant is irreversible, so the guards matter more than the delete.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EmergencyService } from './emergency.service';

function fixture(options: {
  merchant?: any;
  counts?: Record<string, number>;
} = {}) {
  const merchant = options.merchant === undefined
    ? { id: 'm1', name: 'Test Shop', email: 'shop@example.com', status: 'ACTIVE', walletBalance: 0, currency: 'USD' }
    : options.merchant;
  const counts: Record<string, number> = { codes: 0, delivered: 0, ...(options.counts ?? {}) };

  const detached: any[] = [];
  const deleted: string[] = [];
  const audits: any[] = [];
  let transactionUsed = false;

  const count = async (n: number) => n;
  const prisma: any = {
    merchant: {
      findUnique: async () => merchant,
      delete: async ({ where }: any) => { deleted.push(where.id); return merchant; },
    },
    merchantUser: { count: () => count(counts.users ?? 2) },
    apiKey: { count: () => count(counts.apiKeys ?? 1) },
    fulfillmentRequest: { count: () => count(counts.orders ?? 7) },
    walletTransaction: { count: () => count(counts.walletTxns ?? 4) },
    fundingRequest: { count: () => count(counts.funding ?? 1) },
    product: { count: () => count(counts.products ?? 3) },
    connectedProduct: { count: () => count(counts.connected ?? 2) },
    codeItem: {
      count: async ({ where }: any) =>
        where.status === 'DELIVERED' ? counts.delivered : counts.codes,
      updateMany: async ({ where, data }: any) => {
        detached.push({ where, data });
        return { count: counts.codes };
      },
    },
    $transaction: async (callback: any, opts?: any) => {
      transactionUsed = true;
      assert.ok((opts?.timeout ?? 0) >= 30_000, 'a cascading delete needs an explicit budget');
      return callback(prisma);
    },
  };
  const sut = new EmergencyService(prisma, { log: async (e: any) => audits.push(e) } as any);
  return { sut, detached, deleted, audits, get transactionUsed() { return transactionUsed; } };
}

test('the preview separates what is destroyed from what survives', async () => {
  const f = fixture({ counts: { codes: 40, delivered: 12 } });
  const preview = await f.sut.previewMerchantDeletion('m1');

  assert.equal(preview.can_delete, true);
  assert.equal(preview.will_delete.orders, 7);
  assert.equal(preview.will_delete.wallet_transactions, 4);
  assert.equal(preview.will_keep.codes_released_to_platform, 40);
  assert.equal(preview.will_keep.codes_already_delivered, 12);
  assert.equal(preview.will_keep.products_unassigned, 3);
});

test('a funded wallet blocks deletion instead of vaporising the balance', async () => {
  const f = fixture({
    merchant: { id: 'm1', name: 'Rich Shop', email: 'r@e.com', status: 'ACTIVE', walletBalance: 3298.01, currency: 'USD' },
  });
  const preview = await f.sut.previewMerchantDeletion('m1');
  assert.equal(preview.can_delete, false);
  assert.match(preview.blockers[0], /3298\.01 USD/);

  await assert.rejects(
    () => f.sut.deleteMerchant('m1', 'Rich Shop', 'admin-1'),
    /refund or zero it/,
  );
  assert.deepEqual(f.deleted, [], 'nothing may be deleted');
});

test('the balance blocker names the wallet currency, not dollars', async () => {
  const f = fixture({
    merchant: { id: 'm1', name: 'PKR Shop', email: 'p@e.com', status: 'ACTIVE', walletBalance: 989403, currency: 'PKR' },
  });
  const preview = await f.sut.previewMerchantDeletion('m1');
  assert.match(preview.blockers[0], /989403 PKR/);
});

test('a mistyped name refuses the delete', async () => {
  const f = fixture();
  for (const wrong of ['test shop', 'Test  Shop', 'Test Sho', '', 'something else']) {
    await assert.rejects(
      () => f.sut.deleteMerchant('m1', wrong, 'admin-1'),
      /Type the merchant's name exactly/,
    );
  }
  assert.deepEqual(f.deleted, []);
});

test('the exact name deletes, and releases the codes first', async () => {
  const f = fixture({ counts: { codes: 40, delivered: 12 } });
  const result = await f.sut.deleteMerchant('m1', 'Test Shop', 'admin-1', '1.2.3.4');

  assert.equal(result.deleted, true);
  assert.equal(result.codes_released, 40);
  assert.equal(f.transactionUsed, true, 'detach and delete must be one transaction');

  // Codes are detached before the cascade can take them.
  assert.deepEqual(f.detached, [{ where: { merchantId: 'm1' }, data: { merchantId: null } }]);
  assert.deepEqual(f.deleted, ['m1']);
});

test('surrounding whitespace in the typed name is tolerated', async () => {
  const f = fixture();
  await f.sut.deleteMerchant('m1', '  Test Shop  ', 'admin-1');
  assert.deepEqual(f.deleted, ['m1']);
});

test('the deletion is audited with what it removed', async () => {
  const f = fixture({ counts: { codes: 5 } });
  await f.sut.deleteMerchant('m1', 'Test Shop', 'admin-1');

  const entry = f.audits.find((a) => a.action === 'emergency.merchant_delete');
  assert.ok(entry, 'the delete must be audited');
  assert.equal(entry.metadata.name, 'Test Shop');
  assert.equal(entry.metadata.codes_released, 5);
  assert.equal(entry.metadata.deleted.orders, 7);
});

test('an unknown merchant is reported rather than silently ignored', async () => {
  const f = fixture({ merchant: null });
  await assert.rejects(() => f.sut.previewMerchantDeletion('nope'), /Merchant not found/);
  await assert.rejects(() => f.sut.deleteMerchant('nope', 'anything', 'admin-1'), /Merchant not found/);
});
