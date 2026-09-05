// Run: node -r ts-node/register/transpile-only --test src/webhooks/pending-recovery.spec.ts
// A webhook left PENDING by a restart must still get delivered.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebhookService } from './webhook.service';

function service(rows: any[]) {
  const queried: any[] = [];
  const processed: string[] = [];
  const prisma: any = {
    incomingWebhook: {
      findMany: async (args: any) => {
        queried.push(args);
        const cutoff = args.where.createdAt.lt;
        return rows.filter(
          (row) => row.processingStatus === args.where.processingStatus && row.createdAt < cutoff,
        );
      },
    },
  };
  const sut: any = Object.create(WebhookService.prototype);
  sut.prisma = prisma;
  sut.logger = { log: () => {}, warn: () => {}, error: () => {} };
  sut.recovering = false;
  sut.recoveryMinAgeMs = 60000;
  sut.processWebhookAsync = async (id: string) => { processed.push(id); };
  return { sut, queried, processed };
}

const old = new Date(Date.now() - 10 * 60 * 1000);
const payload = JSON.stringify({ platform: 'woocommerce', order_id: '7415' });

test('a webhook stranded in PENDING is picked up and processed', async () => {
  const { sut, processed } = service([
    { id: 'w1', processingStatus: 'PENDING', createdAt: old, rawPayload: payload, rawHeaders: '{}' },
  ]);
  const result = await sut.recoverPendingWebhooks('startup');
  assert.equal(result.recovered, 1);
  assert.deepEqual(processed, ['w1']);
});

test('webhooks that already completed are left alone', async () => {
  const { sut, processed } = service([
    { id: 'done', processingStatus: 'SUCCESS', createdAt: old, rawPayload: payload, rawHeaders: '{}' },
    { id: 'rejected', processingStatus: 'REJECTED', createdAt: old, rawPayload: payload, rawHeaders: '{}' },
  ]);
  assert.equal((await sut.recoverPendingWebhooks()).recovered, 0);
  assert.deepEqual(processed, []);
});

test('a webhook that just arrived is left to its original attempt', async () => {
  const { sut, processed } = service([
    { id: 'fresh', processingStatus: 'PENDING', createdAt: new Date(), rawPayload: payload, rawHeaders: '{}' },
  ]);
  assert.equal((await sut.recoverPendingWebhooks()).recovered, 0);
  assert.deepEqual(processed, [], 'must not race the in-flight attempt');
});

test('one webhook failing does not stop the others being recovered', async () => {
  const { sut, processed } = service([
    { id: 'bad', processingStatus: 'PENDING', createdAt: old, rawPayload: 'not json', rawHeaders: '{}' },
    { id: 'good', processingStatus: 'PENDING', createdAt: old, rawPayload: payload, rawHeaders: '{}' },
  ]);
  const result = await sut.recoverPendingWebhooks();
  assert.equal(result.recovered, 2, 'both were attempted');
  assert.deepEqual(processed, ['good'], 'the parseable one still went through');
});

test('overlapping sweeps do not double-process', async () => {
  const { sut, processed } = service([
    { id: 'w1', processingStatus: 'PENDING', createdAt: old, rawPayload: payload, rawHeaders: '{}' },
  ]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  sut.processWebhookAsync = async (id: string) => { processed.push(id); await gate; };

  const first = sut.recoverPendingWebhooks('sweep');
  const second = await sut.recoverPendingWebhooks('sweep');
  assert.equal(second.skipped, 'already running');
  release();
  await first;
  assert.deepEqual(processed, ['w1'], 'processed exactly once');
});

test('a database failure during the sweep is reported, not thrown', async () => {
  const sut: any = Object.create(WebhookService.prototype);
  sut.prisma = { incomingWebhook: { findMany: async () => { throw new Error('db down'); } } };
  sut.logger = { log: () => {}, warn: () => {}, error: () => {} };
  sut.recovering = false;
  sut.recoveryMinAgeMs = 60000;

  const result = await sut.recoverPendingWebhooks('startup');
  assert.equal(result.recovered, 0);
  assert.match(result.error, /db down/);
  assert.equal(sut.recovering, false, 'the guard must be released for the next sweep');
});
