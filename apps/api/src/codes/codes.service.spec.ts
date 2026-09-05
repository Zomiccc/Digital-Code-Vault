/** Run from the repository root: npx ts-node --project apps/api/tsconfig.json apps/api/src/codes/codes.service.spec.ts */
import { strict as assert } from 'node:assert';
import { CodesService } from './codes.service';

function service(prisma: object, audit: object = {}, fulfillment: object = {}) {
  return new CodesService(
    prisma as ConstructorParameters<typeof CodesService>[0],
    {
      hashCode: (code: string) => `hash:${code}`,
      encrypt: (code: string) => `encrypted:${code}`,
    } as ConstructorParameters<typeof CodesService>[1],
    audit as ConstructorParameters<typeof CodesService>[2],
    fulfillment as ConstructorParameters<typeof CodesService>[3],
  );
}

const denomination = {
  id: 'denom-10', productId: 'product-1', faceValue: 10,
  product: { name: 'Gift card', region: 'US' },
};

function batch(id: string, quantity: number) {
  return {
    id, denominationId: denomination.id, denomination, quantity,
    batchName: `Shipment ${id}`, supplier: null, costPerCode: null,
    currency: 'USD', note: null, createdAt: new Date('2026-09-01T00:00:00Z'),
  };
}

async function listing(batches: ReturnType<typeof batch>[], counts: object[]) {
  let groupCalls = 0;
  const result = await service({
    codeBatch: {
      findMany: async () => batches,
      count: async () => batches.length,
    },
    codeItem: {
      groupBy: async (args: unknown) => {
        groupCalls++;
        assert.deepEqual(args, {
          by: ['batchId', 'status'],
          where: { batchId: { in: batches.map((b) => b.id) } },
          _count: true,
        });
        return counts;
      },
    },
  }).listBatches({ denominationId: denomination.id });
  assert.equal(groupCalls, 1);
  return result;
}

type FailureStage = 'lock' | 'findMany' | 'create' | 'createMany' | 'update' | 'commit';

function uploadMock(insertedCount: number, failureStage?: FailureStage) {
  const events: string[] = [];
  const failure = new Error(`Transaction failed at ${failureStage}`);
  const calls: { create?: any; createMany?: any; update?: any; audit?: any; findMany?: any } = {};
  let inTransaction = false;
  let committed = false;
  const write = (stage: FailureStage, args: any) => {
    assert.equal(inTransaction, true, `${stage} must use the transaction client`);
    events.push(stage);
    if (stage === 'create') calls.create = args;
    if (stage === 'createMany') calls.createMany = args;
    if (stage === 'update') calls.update = args;
    if (failureStage === stage) throw failure;
  };
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      write('lock', undefined);
      assert.match(strings.join('?'), /SELECT pg_advisory_xact_lock\(hashtext\(\?\)\)/);
      assert.deepEqual(values, [denomination.id]);
      return 1;
    },
    codeBatch: {
      create: async (args: any) => { write('create', args); return args.data; },
      update: async (args: any) => { write('update', args); return args.data; },
    },
    codeItem: {
      findMany: async (args: any) => {
        write('findMany', args);
        assert.deepEqual(events.slice(0, 3), ['transaction', 'lock', 'findMany']);
        calls.findMany = args;
        assert.equal(args.where.denominationId, denomination.id);
        assert.deepEqual(args.select, { codeHash: true });
        return args.where.codeHash.in.includes('hash:EXISTS') ? [{ codeHash: 'hash:EXISTS' }] : [];
      },
      createMany: async (args: any) => {
        write('createMany', args);
        return { count: insertedCount };
      },
    },
  };
  // Writes exist only on tx: using the root client instead fails the test.
  const prisma = {
    denomination: { findUnique: async () => denomination },
    $transaction: async (callback: (client: typeof tx) => Promise<void>) => {
      events.push('transaction');
      assert.equal(typeof callback, 'function');
      inTransaction = true;
      try {
        await callback(tx);
        if (failureStage === 'commit') throw failure;
        committed = true;
        events.push('commit');
      } finally {
        inTransaction = false;
      }
    },
  };
  const sut = service(prisma, {
    log: async (args: unknown) => {
      assert.equal(committed, true, 'Audit must follow successful commit');
      events.push('audit');
      calls.audit = args;
    },
  }, {
    fulfillPendingSupplierRequests: async (productId: string) => {
      assert.equal(committed, true, 'Fulfillment must follow successful commit');
      assert.equal(productId, denomination.productId);
      events.push('fulfill');
    },
  });
  return { sut, events, calls, failure };
}

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL ${name}`, error);
  }
}

async function main() {
  await test('two batches of the same denomination retain independent status counts', async () => {
    const result = await listing([batch('a', 900), batch('b', 800)], [
      { batchId: 'b', status: 'AVAILABLE', _count: 7 },
      { batchId: 'a', status: 'DELIVERED', _count: 2 },
      { batchId: 'a', status: 'AVAILABLE', _count: 3 },
      { batchId: 'b', status: 'VOIDED', _count: 1 },
      { batchId: 'a', status: 'RESERVED', _count: 4 },
      { batchId: 'b', status: 'ALLOCATED', _count: 5 },
    ]);
    assert.equal(result.total, 2);
    assert.deepEqual(result.items.map((item) => ({
      id: item.id, name: item.batch_name, denomination: item.denomination.id,
      quantity: item.quantity, counts: item.status_counts,
      available: item.available, delivered: item.delivered, voided: item.voided,
      reserved: item.reserved, allocated: item.allocated,
    })), [
      { id: 'a', name: 'Shipment a', denomination: 'denom-10', quantity: 9,
        counts: { AVAILABLE: 3, DELIVERED: 2, RESERVED: 4 },
        available: 3, delivered: 2, voided: 0, reserved: 4, allocated: 0 },
      { id: 'b', name: 'Shipment b', denomination: 'denom-10', quantity: 13,
        counts: { AVAILABLE: 7, VOIDED: 1, ALLOCATED: 5 },
        available: 7, delivered: 0, voided: 1, reserved: 0, allocated: 5 },
    ]);
  });

  await test('batch without actual codes reports zero despite stale stored quantity', async () => {
    const { items } = await listing([batch('empty', 42)], []);
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, 0);
    assert.deepEqual(items[0].status_counts, {});
    assert.deepEqual([
      items[0].available, items[0].delivered, items[0].voided,
      items[0].reserved, items[0].allocated,
    ], [0, 0, 0, 0, 0]);
  });

  await test('upload atomically creates batch and deduplicated rows using actual inserted quantity', async () => {
    const { sut, calls, events } = uploadMock(2);
    const result = await sut.bulkUpload(
      denomination.id, [' FIRST ', 'FIRST', '   ', 'EXISTS', 'SECOND'],
      'admin-1', 'supplier-1', '127.0.0.1',
      { batchName: ' September shipment ', costPerCode: 8, currency: 'EUR', note: 'Invoice 12' },
    );
    assert.equal(typeof result.batchId, 'string');
    assert.ok(result.batchId.length > 0);
    assert.deepEqual(result, {
      batchId: result.batchId, inserted: 2, duplicates: 2, errors: ['Row 3: empty code'],
    });
    assert.deepEqual(calls.create, { data: {
      id: result.batchId, denominationId: denomination.id, batchName: 'September shipment',
      quantity: 0, supplierId: 'supplier-1', costPerCode: 8, currency: 'EUR',
      note: 'Invoice 12', createdBy: 'admin-1',
    } });
    assert.deepEqual(calls.createMany, {
      data: ['FIRST', 'SECOND'].map((code) => ({
        denominationId: denomination.id, encryptedCode: `encrypted:${code}`,
        codeHash: `hash:${code}`, status: 'AVAILABLE', batchId: result.batchId,
        supplierId: 'supplier-1',
      })),
    });
    assert.deepEqual(calls.findMany, {
      where: { denominationId: denomination.id, codeHash: { in: ['hash:FIRST', 'hash:EXISTS', 'hash:SECOND'] } },
      select: { codeHash: true },
    });
    assert.deepEqual(calls.update, { where: { id: result.batchId }, data: { quantity: 2 } });
    assert.deepEqual(calls.audit.metadata, {
      batchId: result.batchId, total: 5, inserted: 2, duplicates: 2, errors: 1,
      supplierId: 'supplier-1', costPerCode: 8, currency: 'EUR',
    });
    assert.deepEqual(events, ['transaction', 'lock', 'findMany', 'create', 'createMany', 'update', 'commit', 'audit', 'fulfill']);
  });

  await test('all database duplicates persist zero inserted quantity and skip fulfillment', async () => {
    const { sut, calls, events } = uploadMock(0);
    const result = await sut.bulkUpload(denomination.id, ['EXISTS'], 'admin-1');
    assert.equal(result.inserted, 0);
    assert.equal(result.duplicates, 1);
    assert.deepEqual(calls.update, { where: { id: result.batchId }, data: { quantity: 0 } });
    assert.equal(calls.createMany, undefined, 'Existing hashes must be filtered before insertion');
    assert.deepEqual(events, ['transaction', 'lock', 'findMany', 'create', 'update', 'commit', 'audit']);
  });

  await test('stored and returned quantity use createMany count rather than attempted rows', async () => {
    const { sut, calls } = uploadMock(1);
    const result = await sut.bulkUpload(denomination.id, ['FIRST', 'SECOND'], 'admin-1');
    assert.equal(calls.createMany.data.length, 2);
    assert.equal(result.inserted, 1);
    assert.deepEqual(calls.update, { where: { id: result.batchId }, data: { quantity: 1 } });
    assert.equal(calls.audit.metadata.inserted, 1);
  });

  for (const stage of ['lock', 'findMany', 'create', 'createMany', 'update', 'commit'] as const) {
    await test(`transaction ${stage} failure rejects upload without success side effects`, async () => {
      const { sut, events, failure } = uploadMock(1, stage);
      await assert.rejects(
        () => sut.bulkUpload(denomination.id, ['FIRST'], 'admin-1'),
        (error: unknown) => error === failure,
      );
      const writes = ['lock', 'findMany', 'create', 'createMany', 'update'];
      assert.deepEqual(events, [
        'transaction', ...writes.slice(0, stage === 'commit' ? writes.length : writes.indexOf(stage) + 1),
      ]);
    });
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});
