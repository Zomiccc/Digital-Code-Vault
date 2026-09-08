// Run: node -r ts-node/register/transpile-only --test src/currency/regional-pricing.spec.ts
// A region names the currency it reads in. Nothing is converted, and display
// must never break the catalogue.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CurrencyService, localPrice } from './currency.service';

function service(regions: any[]) {
  let regionLookups = 0;
  const prisma: any = {
    region: {
      findFirst: async ({ where }: any) => {
        regionLookups++;
        const wanted = where.OR.map((clause: any) => clause.code ?? clause.name);
        return regions.find((r) => wanted.includes(r.code) || wanted.includes(r.name)) ?? null;
      },
    },
  };
  const sut = new CurrencyService(prisma);
  return { sut, get regionLookups() { return regionLookups; } };
}

const regions = [
  { code: 'TR', name: 'Turkey', currency: 'TRY', symbol: '\u20ba' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', symbol: '\u20a8' },
  { code: 'USA', name: 'United States', currency: 'USD', symbol: '$' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', symbol: 'R$' },
];

test('each region names its own currency, not just Lira', async () => {
  const { sut } = service(regions);

  const turkey = await sut.displayCurrencyForRegion('TR');
  assert.deepEqual([turkey.currency, turkey.symbol], ['TRY', '\u20ba']);

  const pakistan = await sut.displayCurrencyForRegion('PK');
  assert.deepEqual([pakistan.currency, pakistan.symbol], ['PKR', '\u20a8']);

  const brazil = await sut.displayCurrencyForRegion('BR');
  assert.equal(brazil.currency, 'BRL');
});

test('a price is shown in the currency it is stored in, never converted', async () => {
  // The whole point of removing exchange rates: a 250 Lira code is 250 Lira.
  // It used to be multiplied by a rate and shown as thousands.
  const { sut } = service(regions);
  const turkey = await sut.displayCurrencyForRegion('TR');
  const shown = localPrice(250, 'TRY', turkey);
  assert.deepEqual([shown.local_amount, shown.local_currency], [250, 'TRY']);
  assert.equal(shown.local_formatted, '\u20ba250');
});

test('a dollar-priced item in a Lira region still reads in dollars', async () => {
  // A pack entered at $11 is $11 wherever it is listed. Restating it in the
  // region's currency would need a rate, and there is none.
  const { sut } = service(regions);
  const turkey = await sut.displayCurrencyForRegion('TR');
  const shown = localPrice(11, 'USD', turkey);
  assert.deepEqual([shown.local_currency, shown.local_formatted], ['USD', '$11']);
});

test('a region is also found by name, not only by code', async () => {
  const { sut } = service(regions);
  assert.equal((await sut.displayCurrencyForRegion('Turkey')).currency, 'TRY');
});

test('an unknown region falls back to USD instead of breaking the catalogue', async () => {
  const { sut } = service(regions);
  for (const missing of ['ZZ', '', null, undefined]) {
    const display = await sut.displayCurrencyForRegion(missing);
    assert.equal(display.currency, 'USD');
    assert.equal(localPrice(50, null, display).local_amount, 50);
  }
});

test('an unreadable amount shows as zero rather than throwing', async () => {
  const { sut } = service(regions);
  const pakistan = await sut.displayCurrencyForRegion('PK');
  assert.equal(localPrice(Number.NaN, 'PKR', pakistan).local_amount, 0);
});

test('formatted prices carry the currency symbol and thousands separators', async () => {
  const { sut } = service(regions);
  const pakistan = await sut.displayCurrencyForRegion('PK');
  assert.equal(localPrice(30000, 'PKR', pakistan).local_formatted, '\u20a830,000');
});

test('resolving many regions de-duplicates the lookups', async () => {
  const harness = service(regions);
  const map = await harness.sut.displayCurrenciesForRegions(['TR', 'TR', 'PK', '', null, 'TR']);
  assert.deepEqual([...map.keys()].sort(), ['PK', 'TR']);
  assert.equal(harness.regionLookups, 2, 'one lookup per distinct region');
  assert.equal(map.get('TR')!.currency, 'TRY');
});

test('a region lookup that throws still yields a usable display', async () => {
  const prisma: any = { region: { findFirst: async () => { throw new Error('no such table'); } } };
  const display = await new CurrencyService(prisma).displayCurrencyForRegion('TR');
  assert.equal(display.currency, 'USD');
});
