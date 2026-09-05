// Run: node -r ts-node/register/transpile-only --test src/currency/money.spec.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertValidRate,
  convertFromUsd,
  convertToUsd,
  normaliseCurrency,
  roundMoney,
} from './money';

test('currency codes are normalised and anything else rejected', () => {
  assert.equal(normaliseCurrency(' pkr '), 'PKR');
  assert.equal(normaliseCurrency('usd'), 'USD');
  for (const bad of ['', 'PK', 'PKRR', 'P1R', null, undefined, 12, {}]) {
    assert.throws(() => normaliseCurrency(bad), /three-letter code/);
  }
});

test('rates must be positive, finite and plausible', () => {
  assert.equal(assertValidRate(300, 'PKR'), 300);
  assert.equal(assertValidRate('300.5', 'PKR'), 300.5);
  for (const bad of [0, -1, NaN, Infinity, 'abc', null, undefined, 1_000_001]) {
    assert.throws(() => assertValidRate(bad, 'PKR'));
  }
});

test('money rounds to whole cents without drifting down', () => {
  assert.equal(roundMoney(10.005), 10.01);
  assert.equal(roundMoney(10.004), 10);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(-10.005), -10.01);
  assert.equal(roundMoney(0), 0);
  assert.throws(() => roundMoney(NaN));
});

test('a $100 code on a 300 PKR rate costs 30,000 PKR', () => {
  assert.equal(convertFromUsd(100, 300), 30000);
  assert.equal(convertFromUsd(10, 300), 3000);
  assert.equal(convertFromUsd(0, 300), 0);
});

test('converting to USD and back is stable at cent precision', () => {
  assert.equal(convertToUsd(30000, 300), 100);
  assert.equal(convertToUsd(67000, 300), 223.33);
  // 223.33 back out is not exactly 67,000, and that gap must stay under a cent
  // of USD rather than silently accumulating across conversions.
  assert.ok(Math.abs(convertToUsd(convertFromUsd(223.33, 300), 300) - 223.33) < 0.01);
});

test('fractional rates and odd amounts stay on cent boundaries', () => {
  for (const [usd, rate] of [[19.99, 34.17], [0.01, 300], [7.77, 3.5], [1234.56, 283.75]] as const) {
    const converted = convertFromUsd(usd, rate);
    assert.equal(converted, Math.round(converted * 100) / 100, `${usd} at ${rate} must be whole cents`);
  }
});
