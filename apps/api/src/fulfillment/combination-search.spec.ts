// Run: node -r ts-node/register/transpile-only --test src/fulfillment/combination-search.spec.ts
// An order for a value with no code of its own is filled by combining codes.
// This is the behaviour the whole amount-based flow rests on, so the cases that
// used to be refused are pinned here.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AllocationEngineService } from './allocation-engine.service';

const engine = new AllocationEngineService({} as any);

/** `[faceValue, howManyInStock]` pairs, in the shape the engine expects. */
function stock(...entries: [number, number][]) {
  return entries.map(([faceValue, availableCount], i) => ({
    denominationId: `d${i}`,
    faceValue,
    availableCount,
  }));
}

/** The chosen codes as `faceValue x count`, sorted, for readable assertions. */
function describe(result: { faceValue: number; count: number }[] | null) {
  if (!result) return null;
  return result
    .map((item) => `${item.faceValue}x${item.count}`)
    .sort()
    .join(' + ');
}

/** Total value of a result, in cents, to prove it lands on the target exactly. */
function totalCents(result: { faceValue: number; count: number }[] | null) {
  if (!result) return null;
  return result.reduce((sum, item) => sum + Math.round(item.faceValue * 100) * item.count, 0);
}

test('a single code of the right value is preferred over any combination', () => {
  const result = engine.findBestCombination(stock([150, 2], [100, 5], [50, 5]), 150);
  assert.equal(describe(result), '150x1');
});

test('no single code of that value: larger codes are combined to reach it', () => {
  // The case that matters: there is no 150 code, so 100 + 50 is handed over.
  const result = engine.findBestCombination(stock([100, 3], [50, 3], [10, 20]), 150);
  assert.equal(describe(result), '100x1 + 50x1');
  assert.equal(totalCents(result), 15000);
});

test('fifteen small codes are allowed when nothing bigger will do', () => {
  // Refused before: the search gave up after ten codes, so a 150 order against
  // a shelf of nothing but 10s was reported as impossible.
  const result = engine.findBestCombination(stock([10, 40]), 150);
  assert.equal(describe(result), '10x15');
  assert.equal(totalCents(result), 15000);
});

test('the fewest codes win when several combinations reach the target', () => {
  const result = engine.findBestCombination(stock([100, 5], [50, 5], [25, 20], [10, 50]), 150);
  assert.equal(describe(result), '100x1 + 50x1', 'two codes, not five 25s or fifteen 10s');
});

test('stock limits are respected, so a combination never over-draws a value', () => {
  // Only one 100 left, so the rest has to come from smaller codes.
  const result = engine.findBestCombination(stock([100, 1], [25, 10]), 150);
  assert.equal(describe(result), '100x1 + 25x2');
  assert.equal(totalCents(result), 15000);
});

test('a value with no codes left is skipped entirely', () => {
  // A 150 denomination exists but is sold out — the form used to offer it.
  const result = engine.findBestCombination(stock([150, 0], [75, 4]), 150);
  assert.equal(describe(result), '75x2');
});

test('greedy would fail here, and the search must not', () => {
  // Taking the largest first gives 100, then nothing reaches the remaining 50.
  // The answer is 80 + 70, which only an exhaustive search finds.
  const result = engine.findBestCombination(stock([100, 1], [80, 1], [70, 1]), 150);
  assert.equal(describe(result), '70x1 + 80x1');
});

test('sums that are exact to the penny are not lost to floating point', () => {
  // 1.10 + 2.20 is 3.3000000000000003 as a float, and comparing that to 3.30
  // refused an order that added up perfectly.
  assert.equal(describe(engine.findBestCombination(stock([1.1, 5], [2.2, 5]), 3.3)), '1.1x1 + 2.2x1');
  assert.equal(describe(engine.findBestCombination(stock([0.1, 5], [0.2, 5]), 0.3)), '0.1x1 + 0.2x1');
  const cents = engine.findBestCombination(stock([9.99, 10], [0.01, 10]), 20);
  assert.equal(totalCents(cents), 2000);
});

test('decimal code values combine to a whole-number order', () => {
  // 49.99 x2 + 50.02 lands on 150.00 exactly, but only in cents.
  const result = engine.findBestCombination(stock([49.99, 4], [50.02, 4]), 150);
  assert.equal(describe(result), '49.99x2 + 50.02x1');
  assert.equal(totalCents(result), 15000);
});

test('an amount the stock cannot reach exactly is refused, not approximated', () => {
  // Nothing sums to 150, and handing over 160 of codes for a 150 order would
  // give away a code's worth of value.
  assert.equal(engine.findBestCombination(stock([80, 5], [90, 5]), 150), null);
  assert.equal(engine.findBestCombination(stock([100, 1], [25, 1]), 150), null);
});

test('an empty shelf, or a nonsensical amount, is refused rather than throwing', () => {
  assert.equal(engine.findBestCombination([], 150), null);
  assert.equal(engine.findBestCombination(stock([100, 0]), 150), null);
  for (const bad of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(engine.findBestCombination(stock([10, 10]), bad), null);
  }
});

test('a large rupee order still resolves quickly', () => {
  // 30,000 rupees from 250-rupee codes is 120 of them — far past the old cap,
  // and a big enough target that the search must not crawl.
  const started = Date.now();
  const result = engine.findBestCombination(stock([250, 200], [1000, 5]), 30000);
  assert.equal(totalCents(result), 3_000_000);
  assert.equal(describe(result), '1000x5 + 250x100');
  assert.ok(Date.now() - started < 1000, 'must resolve in well under a second');
});

test('an order matching one code exactly is never broken into smaller ones', () => {
  const result = engine.findBestCombination(stock([250, 4], [50, 20]), 250);
  assert.equal(describe(result), '250x1');
});
