// Run: node -r ts-node/register/transpile-only --test src/currency/regional-pricing.spec.ts
// Display prices follow the region; unlike charging, they must never break.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CurrencyService, localPrice } from './currency.service';

function service(regions: any[], rates: Record<string, number>) {
  let regionLookups = 0;
  const prisma: any = {
    region: {
      findFirst: async ({ where }: any) => {
        regionLookups++;
        const wanted = where.OR.map((clause: any) => clause.code ?? clause.name);
        return regions.find((r) => wanted.includes(r.code) || wanted.includes(r.name)) ?? null;
      },
    },
    exchangeRate: {
      findUnique: async ({ where }: any) =>
        rates[where.currency] === undefined
          ? null
          : { currency: where.currency, unitsPerUsd: rates[where.currency] },
    },
  };
  const sut = new CurrencyService(prisma, { log: async () => {} } as any);
  return { sut, get regionLookups() { return regionLookups; } };
}

const regions = [
  { code: 'TR', name: 'Turkey', currency: 'TRY', symbol: '₺' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', symbol: '₨' },
  { code: 'USA', name: 'United States', currency: 'USD', symbol: '$' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', symbol: 'R$' },
];
const rates = { TRY: 34.2, PKR: 300, BRL: 5.4 };

test('each region prices in its own currency, not just Lira', async () => {
  const { sut } = service(regions, rates);

  const turkey = await sut.displayCurrencyForRegion('TR');
  assert.deepEqual(
    [turkey.currency, turkey.symbol, turkey.rate, turkey.converted],
    ['TRY', '₺', 34.2, true],
  );
  assert.equal(localPrice(100, turkey).local_amount, 3420);

  const pakistan = await sut.displayCurrencyForRegion('PK');
  assert.equal(localPrice(100, pakistan).local_amount, 30000);
  assert.equal(localPrice(100, pakistan).local_symbol, '₨');

  const brazil = await sut.displayCurrencyForRegion('BR');
  assert.equal(localPrice(19.99, brazil).local_amount, 107.95);
});

test('a USD region stays in dollars and is not marked converted', async () => {
  const { sut } = service(regions, rates);
  const usa = await sut.displayCurrencyForRegion('USA');
  assert.equal(usa.currency, 'USD');
  assert.equal(usa.converted, false);
  assert.equal(localPrice(100, usa).local_amount, 100);
});

test('a region is also found by name, not only by code', async () => {
  const { sut } = service(regions, rates);
  assert.equal((await sut.displayCurrencyForRegion('Turkey')).currency, 'TRY');
});

test('an unknown region falls back to USD instead of breaking the catalogue', async () => {
  const { sut } = service(regions, rates);
  for (const missing of ['ZZ', '', null, undefined]) {
    const display = await sut.displayCurrencyForRegion(missing);
    assert.equal(display.currency, 'USD');
    assert.equal(display.converted, false);
    assert.equal(localPrice(50, display).local_amount, 50);
  }
});

test('a region whose currency has no rate yet shows USD rather than a wrong price', async () => {
  // Brazil exists and prices in BRL, but no BRL rate has been configured.
  const { sut } = service(regions, { TRY: 34.2 });
  const display = await sut.displayCurrencyForRegion('BR');
  assert.equal(display.currency, 'USD');
  assert.equal(display.converted, false);
  assert.equal(localPrice(100, display).local_amount, 100, 'must not silently invent a BRL price');
});

test('formatted prices carry the region symbol and thousands separators', async () => {
  const { sut } = service(regions, rates);
  const pakistan = await sut.displayCurrencyForRegion('PK');
  assert.equal(localPrice(100, pakistan).local_formatted, '₨30,000.00');
  assert.equal(localPrice(100, pakistan).amount_usd, 100);
  assert.equal(localPrice(100, pakistan).fx_rate, 300);
});

test('resolving many regions de-duplicates the lookups', async () => {
  const harness = service(regions, rates);
  const map = await harness.sut.displayCurrenciesForRegions(['TR', 'TR', 'PK', '', null, 'TR']);
  assert.deepEqual([...map.keys()].sort(), ['PK', 'TR']);
  assert.equal(harness.regionLookups, 2, 'one lookup per distinct region');
  assert.equal(map.get('TR')!.currency, 'TRY');
});
