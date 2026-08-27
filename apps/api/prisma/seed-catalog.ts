/**
 * Catalog seed — replicates the storefront structure of a typical digital-code shop:
 * Category -> Product (per region) -> wallet-topup Denominations + subscription Variants.
 *
 * Idempotent: safe to run repeatedly. Prices are editable defaults (PKR storefront).
 * Run: npm run seed:catalog  (inside apps/api)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

interface VariantSeed {
  name: string;
  price: number; // PKR storefront price
}

interface ProductSeed {
  name: string;
  regionCode: string;
  active?: boolean;
  denoms?: { faceValue: number; currency: string }[];
  variants?: VariantSeed[];
}

interface CategorySeed {
  name: string;
  sortOrder: number;
  products: ProductSeed[];
}

// PlayStation Plus plans offered on every PSN regional product
// Prices in USD — the admin maps each variant to denomination codes via Fulfillment Presets.
function psPlusVariants(): VariantSeed[] {
  return [
    { name: 'PS Essential: 1 Month', price: 9.99 },
    { name: 'PS Essential: 3 Months', price: 24.99 },
    { name: 'PS Essential: 12 Months', price: 59.99 },
    { name: 'PS Extra: 1 Month', price: 14.99 },
    { name: 'PS Extra: 3 Months', price: 39.99 },
    { name: 'PS Extra: 12 Months', price: 99.99 },
    { name: 'PS Premium: 1 Month', price: 17.99 },
    { name: 'PS Premium: 3 Months', price: 49.99 },
    { name: 'PS Premium: 12 Months', price: 119.99 },
  ];
}

function usd(values: number[]) {
  return values.map((v) => ({ faceValue: v, currency: 'USD' }));
}

const REGIONS: Record<string, { name: string; code: string; currency: string; symbol: string }> = {
  USA: { name: 'United States', code: 'USA', currency: 'USD', symbol: '$' },
  UK: { name: 'United Kingdom', code: 'UK', currency: 'GBP', symbol: '£' },
  UAE: { name: 'United Arab Emirates', code: 'UAE', currency: 'AED', symbol: 'د.إ' },
  TURKEY: { name: 'Turkey', code: 'TR', currency: 'TRY', symbol: '₺' },
  KSA: { name: 'Saudi Arabia', code: 'KSA', currency: 'SAR', symbol: '﷼' },
  CANADA: { name: 'Canada', code: 'CA', currency: 'CAD', symbol: '$' },
  PAKISTAN: { name: 'Pakistan', code: 'PK', currency: 'PKR', symbol: '₨' },
  GLOBAL: { name: 'Global', code: 'GLOBAL', currency: 'USD', symbol: '$' },
};

const CATALOG: CategorySeed[] = [
  {
    name: 'PlayStation',
    sortOrder: 1,
    products: [
      {
        name: 'PlayStation USA Digital Code',
        regionCode: 'USA',
        denoms: usd([10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100, 125, 150, 200, 250]),
        variants: psPlusVariants(),
      },
      {
        name: 'PSN UK Digital Code',
        regionCode: 'UK',
        denoms: usd([10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100]).map((d) => ({ ...d, currency: 'GBP' })),
        variants: psPlusVariants(),
      },
      {
        name: 'PSN UAE Digital Code',
        regionCode: 'UAE',
        denoms: usd([50, 100, 200, 300, 400, 500]).map((d) => ({ ...d, currency: 'AED' })),
        variants: psPlusVariants(),
      },
      {
        name: 'PSN Turkey Digital Code',
        regionCode: 'TURKEY',
        denoms: usd([250, 500, 1000, 2000, 3500]).map((d) => ({ ...d, currency: 'TRY' })),
        variants: psPlusVariants(),
      },
      {
        name: 'PSN KSA Digital Code',
        regionCode: 'KSA',
        denoms: usd([50, 100, 150, 200, 300]).map((d) => ({ ...d, currency: 'SAR' })),
        variants: psPlusVariants(),
      },
      {
        name: 'PSN CA Digital Code',
        regionCode: 'CANADA',
        denoms: usd([10, 20, 25, 50, 75, 100]).map((d) => ({ ...d, currency: 'CAD' })),
        variants: psPlusVariants(),
      },
      // Coming soon on the reference store — seeded inactive
      { name: 'PSN AU Digital Code', regionCode: 'GLOBAL', active: false, variants: psPlusVariants() },
      { name: 'PSN HK Digital Code', regionCode: 'GLOBAL', active: false, variants: psPlusVariants() },
      { name: 'PSN QA Digital Code', regionCode: 'GLOBAL', active: false, variants: psPlusVariants() },
      { name: 'PSN IN Digital Code', regionCode: 'GLOBAL', active: false, variants: psPlusVariants() },
    ],
  },
  {
    name: 'Xbox',
    sortOrder: 2,
    products: [
      {
        name: 'Xbox USA Gift Card',
        regionCode: 'USA',
        denoms: usd([10, 15, 25, 50, 75, 100]),
      },
      {
        name: 'Xbox Game Pass Subscriptions',
        regionCode: 'USA',
        variants: [
          { name: 'Game Pass Core: 1 Month', price: 10.99 },
          { name: 'Game Pass Core: 3 Months', price: 29.99 },
          { name: 'Game Pass Ultimate: 1 Month', price: 19.99 },
          { name: 'Game Pass Ultimate: 3 Months', price: 44.99 },
          { name: 'Game Pass Ultimate: 12 Months', price: 194.99 },
        ],
      },
    ],
  },
  {
    name: 'Apple',
    sortOrder: 3,
    products: [
      {
        name: 'iTunes USA Gift Card',
        regionCode: 'USA',
        denoms: usd([5, 10, 15, 20, 25, 50, 100]),
      },
    ],
  },
  {
    name: 'Nintendo',
    sortOrder: 4,
    products: [
      {
        name: 'Nintendo eShop USA',
        regionCode: 'USA',
        denoms: usd([10, 20, 35, 50, 100]),
      },
      {
        name: 'Nintendo Switch Online Membership',
        regionCode: 'USA',
        variants: [
          { name: 'Individual: 1 Month', price: 3.99 },
          { name: 'Individual: 3 Months', price: 7.99 },
          { name: 'Individual: 12 Months', price: 19.99 },
          { name: 'Family: 12 Months', price: 34.99 },
        ],
      },
    ],
  },
  {
    name: 'Steam',
    sortOrder: 5,
    products: [
      {
        name: 'Steam USA Wallet Code',
        regionCode: 'USA',
        denoms: usd([5, 10, 20, 50, 100]),
      },
    ],
  },
  {
    name: 'Google Play',
    sortOrder: 6,
    products: [
      {
        name: 'Google Play USA Gift Card',
        regionCode: 'USA',
        denoms: usd([5, 10, 15, 25, 50, 100]),
      },
    ],
  },
  {
    name: 'PUBG UC',
    sortOrder: 7,
    products: [
      {
        name: 'PUBG UC — Pakistan Region',
        regionCode: 'PAKISTAN',
        denoms: usd([60, 180, 325, 385, 660, 810, 1800]).map((d) => ({ ...d, currency: 'UC' })),
      },
      {
        name: 'PUBG UC — Other Regions',
        regionCode: 'GLOBAL',
        denoms: usd([60, 180, 325, 385, 660, 810, 1800]).map((d) => ({ ...d, currency: 'UC' })),
      },
    ],
  },
  {
    name: 'Softwares',
    sortOrder: 8,
    products: [
      {
        name: 'Nord VPN Subscription',
        regionCode: 'GLOBAL',
        variants: [
          { name: 'Nord VPN: 1 Month', price: 12.99 },
          { name: 'Nord VPN: 1 Year', price: 59.88 },
          { name: 'Nord VPN: 2 Years', price: 95.76 },
        ],
      },
      {
        name: 'MS Office Pro Plus Keys',
        regionCode: 'GLOBAL',
        variants: [{ name: 'Office Pro Plus: 5 PCs', price: 49.99 }],
      },
      {
        name: 'Windows 11 Pro Key',
        regionCode: 'GLOBAL',
        variants: [{ name: 'Windows 11 Pro: 1 PC', price: 25.99 }],
      },
    ],
  },
  {
    name: 'Razer Gold',
    sortOrder: 9,
    products: [
      {
        name: 'Razer Gold USA',
        regionCode: 'USA',
        denoms: usd([5, 10, 20, 25, 50, 100]),
      },
    ],
  },
  {
    name: 'Roblox',
    sortOrder: 10,
    products: [
      {
        name: 'Roblox Robux',
        regionCode: 'USA',
        denoms: usd([400, 800, 1700, 4500, 10000]).map((d) => ({ ...d, currency: 'ROBUX' })),
      },
    ],
  },
  {
    name: 'Epic Games',
    sortOrder: 11,
    products: [
      {
        name: 'Fortnite V-Bucks USA',
        regionCode: 'USA',
        denoms: usd([1000, 2800, 5000, 13500]).map((d) => ({ ...d, currency: 'VBUCKS' })),
      },
    ],
  },
  {
    name: 'Consoles & Accessories',
    sortOrder: 12,
    products: [],
  },
];

async function ensureRegion(key: string) {
  const def = REGIONS[key];
  if (!def) throw new Error(`Unknown region key: ${key}`);
  return (
    (await prisma.region.findUnique({ where: { code: def.code } })) ||
    (await prisma.region.create({
      data: { name: def.name, code: def.code, currency: def.currency, symbol: def.symbol },
    }))
  );
}

async function ensureCategory(name: string, sortOrder: number) {
  const slug = slugify(name);
  return (
    (await prisma.category.findUnique({ where: { slug } })) ||
    (await prisma.category.create({
      data: { name, slug, description: `${name} digital codes and subscriptions`, sortOrder },
    }))
  );
}

async function ensureProduct(seed: ProductSeed, categoryId: string) {
  const existing = await prisma.product.findFirst({
    where: { name: seed.name, region: REGIONS[seed.regionCode].code },
  });
  if (existing) {
    if (!existing.categoryId || seed.active === false) {
      // keep as-is; only ensure linkage below
    }
    return existing;
  }
  return prisma.product.create({
    data: {
      name: seed.name,
      region: REGIONS[seed.regionCode].code,
      categoryId,
      status: seed.active === false ? 'INACTIVE' : 'ACTIVE',
      productType: (seed.variants?.length ?? 0) > 0 ? 'ESSENTIALS' : 'NORMAL',
    },
  });
}

async function ensureProductRegion(productId: string, regionKey: string) {
  const region = await ensureRegion(regionKey);
  return (
    (await prisma.productRegion.findUnique({
      where: { productId_regionId: { productId, regionId: region.id } },
    })) || (await prisma.productRegion.create({ data: { productId, regionId: region.id } }))
  );
}

async function ensureDenomination(productId: string, faceValue: number, currency: string) {
  return (
    (await prisma.denomination.findFirst({
      where: { productId, faceValue, currency },
    })) ||
    (await prisma.denomination.create({
      data: { productId, faceValue, currency },
    }))
  );
}

async function ensureVariant(productRegionId: string, v: VariantSeed, sortOrder: number) {
  const slug = slugify(v.name);
  const existing = await prisma.variant.findUnique({
    where: { productRegionId_slug: { productRegionId, slug } },
  });
  if (existing) {
    if (Number(existing.customerPrice) !== v.price || existing.currency !== 'USD') {
      return prisma.variant.update({
        where: { id: existing.id },
        data: { customerPrice: v.price, currency: 'USD' },
      });
    }
    return existing;
  }
  return prisma.variant.create({
    data: {
      productRegionId,
      name: v.name,
      slug,
      customerPrice: v.price,
      currency: 'USD',
      sortOrder,
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== 'true') {
    console.error('Refusing to run demo catalog seed script in production (NODE_ENV=production).');
    console.error('If you really intend to seed a non-production database, set ALLOW_SEED_IN_PRODUCTION=true.');
    process.exit(1);
  }

  console.log('Seeding catalog (categories, products, regions, variants)...');

  let productCount = 0;
  let denomCount = 0;
  let variantCount = 0;

  for (const cat of CATALOG) {
    const category = await ensureCategory(cat.name, cat.sortOrder);

    for (const prod of cat.products) {
      const product = await ensureProduct(prod, category.id);
      productCount++;

      const productRegion = await ensureProductRegion(product.id, prod.regionCode);

      for (const d of prod.denoms || []) {
        await ensureDenomination(product.id, d.faceValue, d.currency);
        denomCount++;
      }

      let order = 0;
      for (const v of prod.variants || []) {
        await ensureVariant(productRegion.id, v, order++);
        variantCount++;
      }
    }
    console.log(`  ✓ ${cat.name} (${cat.products.length} products)`);
  }

  console.log(`\nDone. Products: ${productCount}, denominations ensured: ${denomCount}, variants ensured: ${variantCount}`);
  console.log('Next step: open Admin → Fulfillment Presets to map each variant to its codes.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
