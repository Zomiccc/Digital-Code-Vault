// Run: node -r ts-node/register/transpile-only --test src/products/sku.spec.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProductSkuBase, uniqueSku, normaliseSku, denominationSku } from './sku';

test('known products keep their curated SKU regardless of casing', () => {
  assert.equal(resolveProductSkuBase('PSN KSA Digital Code', 'KSA'), 'PSN-KSA');
  assert.equal(resolveProductSkuBase('  psn ksa digital code  ', 'KSA'), 'PSN-KSA');
  assert.equal(resolveProductSkuBase('Steam USA Wallet Code', 'USA'), 'STEAM-USA');
});

test('unknown products fall back to a keyword prefix plus region', () => {
  assert.equal(resolveProductSkuBase('Netflix Gift Card', 'Turkey'), 'NETFLIX-TUR');
  assert.equal(resolveProductSkuBase('Spotify Premium', 'PK'), 'SPOTIFY-PK');
});

test('a product matching no keyword still gets a deterministic SKU', () => {
  const first = resolveProductSkuBase('Acme Super Widget', 'BR');
  assert.equal(first, resolveProductSkuBase('Acme Super Widget', 'BR'), 'must be deterministic');
  assert.match(first, /^[A-Z]+-BR$/);
});

test('a missing region degrades to GLO rather than an empty segment', () => {
  assert.equal(resolveProductSkuBase('Netflix Gift Card', ''), 'NETFLIX-GLO');
  assert.match(resolveProductSkuBase('Acme Widget', ''), /-GLO$/);
});

test('SKUs are normalised so lookups compare consistently', () => {
  assert.equal(normaliseSku('  psn-ksa '), 'PSN-KSA');
  assert.equal(normaliseSku('psn ksa'), 'PSN-KSA');
});

test('a colliding SKU gains a numeric suffix instead of being rejected', () => {
  assert.equal(uniqueSku('PSN-KSA', []), 'PSN-KSA');
  assert.equal(uniqueSku('PSN-KSA', ['PSN-KSA']), 'PSN-KSA-1');
  assert.equal(uniqueSku('PSN-KSA', ['PSN-KSA', 'PSN-KSA-1']), 'PSN-KSA-2');
  // Collision detection ignores casing, so a lower-case row still counts.
  assert.equal(uniqueSku('PSN-KSA', ['psn-ksa']), 'PSN-KSA-1');
});

test('denomination SKUs hang off the product SKU', () => {
  assert.equal(denominationSku('PSN-KSA', 10), 'PSN-KSA-10');
  assert.equal(denominationSku('psn-ksa', 50), 'PSN-KSA-50');
});
