// Run: node -r ts-node/register/transpile-only --test src/currency/money.spec.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseCurrency, roundMoney, formatMoney, symbolFor } from './money';

test('currency codes are normalised and anything else rejected', () => {
  assert.equal(normaliseCurrency(' pkr '), 'PKR');
  assert.equal(normaliseCurrency('usd'), 'USD');
  for (const bad of ['', 'PK', 'PKRR', 'P1R', null, undefined, 12, {}]) {
    assert.throws(() => normaliseCurrency(bad), /three-letter code/);
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

test('money is shown in the currency it is actually in, for every region', () => {
  // A Turkish 250 Lira code was shown to the customer as "$250".
  assert.equal(formatMoney(250, 'TRY'), '₺250');
  assert.equal(formatMoney(250, 'USD'), '$250');
  assert.equal(formatMoney(30000, 'PKR'), '₨30,000');
  assert.equal(formatMoney(187.5, 'SAR'), '﷼187.5');
  assert.equal(formatMoney(100, 'GBP'), '£100');
});

test('an unmapped currency shows its own code, never another symbol', () => {
  assert.equal(formatMoney(500, 'JPY'), 'JPY 500');
  assert.equal(formatMoney(500, 'BRL'), 'BRL 500');
});

test('a missing or unusable amount still renders', () => {
  assert.equal(formatMoney(250, null), '$250');
  assert.equal(formatMoney(250, undefined), '$250');
  assert.equal(formatMoney(null, 'TRY'), '₺0');
  assert.equal(formatMoney('not-a-number', 'TRY'), '₺0');
});

test('a currency without a known symbol is written with its own code', () => {
  assert.equal(symbolFor('PKR'), '\u20a8');
  assert.equal(symbolFor('TRY'), '\u20ba');
  assert.equal(symbolFor('BRL'), 'BRL');
  assert.equal(symbolFor(null), '$');
});
