// Run: node -r ts-node/register/transpile-only --test src/fulfillment/batch-priority.spec.ts
// Codes are handed out in the batch order the admin set.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AllocationEngineService } from './allocation-engine.service';

/** `codes` maps a batch id (or the string 'none' for unbatched) to code ids. */
function engine(batches: { id: string; priority: number }[], codes: Record<string, string[]>) {
  const reserved: string[] = [];
  const tx: any = {
    codeBatch: {
      findMany: async ({ orderBy }: any) => {
        assert.deepEqual(orderBy, [{ priority: 'asc' }, { createdAt: 'asc' }]);
        return [...batches].sort((a, b) => a.priority - b.priority).map((b) => ({ id: b.id }));
      },
    },
    codeItem: {
      findMany: async ({ where, take }: any) => {
        let pool: string[];
        if (where.batchId && typeof where.batchId === 'string') {
          pool = codes[where.batchId] ?? [];
        } else {
          // The unbatched fallback: everything not in a known batch.
          const known = new Set(batches.map((b) => b.id));
          pool = Object.entries(codes)
            .filter(([batchId]) => !known.has(batchId))
            .flatMap(([, ids]) => ids);
        }
        return pool.slice(0, take).map((id) => ({ id, denominationId: 'd1' }));
      },
      updateMany: async ({ where }: any) => {
        reserved.push(...where.id.in);
        return { count: where.id.in.length };
      },
    },
  };
  const sut = new AllocationEngineService({} as any);
  return { sut, tx, reserved };
}

const combo = [{ denominationId: 'd1', faceValue: 50, count: 2 }];

test('the batch with the lowest priority is drained first', async () => {
  const { sut, tx } = engine(
    [{ id: 'A', priority: 5 }, { id: 'B', priority: 1 }],
    { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
  );
  const [result] = await sut.reserveCodes(tx, 'req', combo, 15, null);
  assert.deepEqual(result.codeItemIds, ['b1', 'b2'], 'batch B was marked to clear first');
});

test('allocation spills into the next batch only once the first is empty', async () => {
  const { sut, tx } = engine(
    [{ id: 'A', priority: 5 }, { id: 'B', priority: 1 }],
    { A: ['a1', 'a2'], B: ['b1'] },
  );
  const [result] = await sut.reserveCodes(tx, 'req', combo, 15, null);
  assert.deepEqual(result.codeItemIds, ['b1', 'a1'], 'B empties before A is touched');
});

test('reprioritising changes which batch clears next', async () => {
  const { sut, tx } = engine(
    [{ id: 'A', priority: -1 }, { id: 'B', priority: 1 }],
    { A: ['a1', 'a2'], B: ['b1', 'b2'] },
  );
  const [result] = await sut.reserveCodes(tx, 'req', combo, 15, null);
  assert.deepEqual(result.codeItemIds, ['a1', 'a2'], 'A now sits at the front');
});

test('unbatched codes are used only after every batch is exhausted', async () => {
  const { sut, tx } = engine(
    [{ id: 'A', priority: 0 }],
    { A: ['a1'], none: ['x1', 'x2'] },
  );
  const [result] = await sut.reserveCodes(tx, 'req', combo, 15, null);
  assert.deepEqual(result.codeItemIds, ['a1', 'x1'], 'batched stock goes first');
});

test('a denomination with no batches still allocates its loose codes', async () => {
  const { sut, tx } = engine([], { none: ['x1', 'x2', 'x3'] });
  const [result] = await sut.reserveCodes(tx, 'req', combo, 15, null);
  assert.deepEqual(result.codeItemIds, ['x1', 'x2']);
});

test('running short across all batches is still reported as insufficient stock', async () => {
  const { sut, tx } = engine([{ id: 'A', priority: 0 }], { A: ['a1'] });
  await assert.rejects(
    () => sut.reserveCodes(tx, 'req', combo, 15, null),
    (error: any) => {
      assert.equal(error.response?.code, 'INSUFFICIENT_STOCK');
      return true;
    },
  );
});
