import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  // Hard safety guard: this script creates fake demo products, codes, and
  // hardcoded credentials (admin@digitalcode.local / merchant@test.com).
  // It must never run against a production database.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== 'true') {
    console.error('Refusing to run demo seed script in production (NODE_ENV=production).');
    console.error('This script creates fake demo data and hardcoded credentials.');
    console.error('If you really intend to seed a non-production database, set ALLOW_SEED_IN_PRODUCTION=true.');
    process.exit(1);
  }

  console.log('Seeding database...');

  // Use the encryption key from environment or generate one
  const encKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
  if (!process.env.ENCRYPTION_KEY) {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '..', '.env.generated');
    fs.writeFileSync(envPath, `ENCRYPTION_KEY="${encKey}"\n`);
    console.log('⚠️  No ENCRYPTION_KEY in env. Generated key written to .env.generated');
    console.log('   Add this to your .env file to decrypt seeded codes.');
  } else {
    console.log('✓ Using ENCRYPTION_KEY from environment');
  }

  // Create suppliers (idempotent)
  const supplier1 =
    (await prisma.supplier.findFirst({ where: { name: 'GameCodes Inc' } })) ||
    (await prisma.supplier.create({
      data: { name: 'GameCodes Inc', contactInfo: 'sales@gamecodes.test' },
    }));
  const supplier2 =
    (await prisma.supplier.findFirst({ where: { name: 'DigitalGift Co' } })) ||
    (await prisma.supplier.create({
      data: { name: 'DigitalGift Co', contactInfo: 'orders@digitalgift.test' },
    }));

  // Helper to find or create product
  async function getOrCreateProduct(name: string, region: string, supplierId: string) {
    return (
      (await prisma.product.findFirst({ where: { name, region } })) ||
      (await prisma.product.create({
        data: { name, region, supplierId, status: 'ACTIVE' },
      }))
    );
  }

  // Create products (idempotent)
  const psn = await getOrCreateProduct('PSN', 'USA', supplier1.id);
  const xbox = await getOrCreateProduct('Xbox', 'USA', supplier1.id);
  const steam = await getOrCreateProduct('Steam', 'Global', supplier2.id);
  const roblox = await getOrCreateProduct('Roblox', 'Global', supplier2.id);

  // Create denominations (idempotent)
  const denominations: Record<string, string> = {};

  for (const product of [psn, xbox, steam, roblox]) {
    for (const value of [10, 20, 25, 50, 75, 100]) {
      const denom =
        (await prisma.denomination.findFirst({
          where: { productId: product.id, faceValue: value, currency: 'USD' },
        })) ||
        (await prisma.denomination.create({
          data: { productId: product.id, faceValue: value, currency: 'USD' },
        }));
      denominations[`${product.name}-${value}`] = denom.id;
    }
  }

  // Create test codes (encrypted)
  const cipher = (plaintext: string) => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(encKey, 'hex'), iv);
    const encrypted = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
    const authTag = c.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  };

  const hashCode = (plaintext: string) =>
    crypto.createHash('sha256').update(plaintext).digest('hex');

  // Insert 10 codes per denomination for PSN
  for (const value of [10, 20, 25, 50, 75, 100]) {
    const denomId = denominations[`PSN-${value}`];
    for (let i = 0; i < 10; i++) {
      const code = `PSN-USA-${value}-${String(i).padStart(4, '0')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      await prisma.codeItem.create({
        data: {
          denominationId: denomId,
          encryptedCode: cipher(code),
          codeHash: hashCode(code),
          status: 'AVAILABLE',
          batchId: 'seed-batch-001',
          supplierId: supplier1.id,
        },
      });
    }
  }

  // Insert 5 codes per denomination for Xbox
  for (const value of [10, 20, 25, 50, 75, 100]) {
    const denomId = denominations[`Xbox-${value}`];
    for (let i = 0; i < 5; i++) {
      const code = `XBOX-USA-${value}-${String(i).padStart(4, '0')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      await prisma.codeItem.create({
        data: {
          denominationId: denomId,
          encryptedCode: cipher(code),
          codeHash: hashCode(code),
          status: 'AVAILABLE',
          batchId: 'seed-batch-002',
          supplierId: supplier1.id,
        },
      });
    }
  }

  // Create admin user (idempotent)
  const adminExists = await prisma.adminUser.findUnique({
    where: { email: 'admin@digitalcode.local' },
  });
  if (!adminExists) {
    const adminPassword = await argon2.hash('Admin123!@#');
    await prisma.adminUser.create({
      data: {
        email: 'admin@digitalcode.local',
        name: 'Super Admin',
        passwordHash: adminPassword,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });
  }

  // Create merchant (idempotent)
  const merchantExists = await prisma.merchant.findUnique({
    where: { email: 'merchant@test.com' },
  });
  let merchant: any = merchantExists;
  if (!merchant) {
    const merchantPassword = await argon2.hash('Merchant123!@#');
    merchant = await prisma.merchant.create({
      data: {
        name: 'Test Merchant',
        email: 'merchant@test.com',
        walletBalance: 10000,
        currency: 'USD',
        allowedProductIds: JSON.stringify([psn.id, xbox.id, steam.id, roblox.id]),
        status: 'ACTIVE',
        users: {
          create: {
            email: 'merchant@test.com',
            name: 'Test Merchant',
            passwordHash: merchantPassword,
            isActive: true,
          },
        },
      },
    });
  } else {
    // Ensure merchant has latest canonical product IDs
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        allowedProductIds: JSON.stringify([psn.id, xbox.id, steam.id, roblox.id]),
      },
    });
  }

  // ─── Admin Wallet (demo balance: $10,000) ───
  const existingWallet = await prisma.adminWallet.findFirst();
  if (!existingWallet) {
    const wallet = await prisma.adminWallet.create({
      data: {
        balance: 10000,
        currency: 'USD',
      },
    });
    await prisma.adminWalletTransaction.create({
      data: {
        adminWalletId: wallet.id,
        type: 'CREDIT',
        amount: 10000,
        balanceAfter: 10000,
        source: 'MANUAL',
        description: 'Initial demo funding — $10,000',
      },
    });
    console.log('✓ Admin wallet seeded with $10,000 demo balance');
  } else {
    console.log('✓ Admin wallet already exists — balance:', existingWallet.balance);
  }

  // ─── Catalog Seed Data ───

  // Helper to slugify
  function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  // Create categories (idempotent)
  async function getOrCreateCategory(name: string, description: string) {
    const slug = slugify(name);
    return (
      (await prisma.category.findUnique({ where: { slug } })) ||
      (await prisma.category.create({ data: { name, slug, description } }))
    );
  }

  const catGaming = await getOrCreateCategory('Gaming', 'Game store gift cards and codes');
  const catStreaming = await getOrCreateCategory('Streaming', 'Streaming service gift cards');
  const catShopping = await getOrCreateCategory('Shopping', 'General shopping gift cards');

  // Assign products to categories
  await prisma.product.update({ where: { id: psn.id }, data: { categoryId: catGaming.id } });
  await prisma.product.update({ where: { id: xbox.id }, data: { categoryId: catGaming.id } });
  await prisma.product.update({ where: { id: steam.id }, data: { categoryId: catGaming.id } });
  await prisma.product.update({ where: { id: roblox.id }, data: { categoryId: catGaming.id } });

  // Create regions (idempotent)
  async function getOrCreateRegion(name: string, code: string, currency: string, symbol: string) {
    return (
      (await prisma.region.findUnique({ where: { code } })) ||
      (await prisma.region.create({ data: { name, code, currency, symbol } }))
    );
  }

  const regionUS = await getOrCreateRegion('United States', 'USA', 'USD', '$');
  const regionEU = await getOrCreateRegion('Europe', 'EUR', 'EUR', '€');
  const regionGlobal = await getOrCreateRegion('Global', 'GLOBAL', 'USD', '$');

  // Create product-region mappings (idempotent)
  async function getOrCreateProductRegion(productId: string, regionId: string) {
    const existing = await prisma.productRegion.findUnique({
      where: { productId_regionId: { productId, regionId } },
    });
    return existing || (await prisma.productRegion.create({ data: { productId, regionId } }));
  }

  const prPsnUS = await getOrCreateProductRegion(psn.id, regionUS.id);
  const prXboxUS = await getOrCreateProductRegion(xbox.id, regionUS.id);
  const prSteamGlobal = await getOrCreateProductRegion(steam.id, regionGlobal.id);
  const prRobloxGlobal = await getOrCreateProductRegion(roblox.id, regionGlobal.id);

  // Create variants (idempotent)
  async function getOrCreateVariant(productRegionId: string, name: string, customerPrice: number) {
    const slug = slugify(name);
    const existing = await prisma.variant.findUnique({
      where: { productRegionId_slug: { productRegionId, slug } },
    });
    return existing || (await prisma.variant.create({ data: { productRegionId, name, slug, customerPrice, currency: 'USD' } }));
  }

  const vPsn10 = await getOrCreateVariant(prPsnUS.id, '$10 Card', 10);
  const vPsn25 = await getOrCreateVariant(prPsnUS.id, '$25 Card', 25);
  const vPsn50 = await getOrCreateVariant(prPsnUS.id, '$50 Card', 50);
  const vPsn100 = await getOrCreateVariant(prPsnUS.id, '$100 Card', 100);

  const vXbox10 = await getOrCreateVariant(prXboxUS.id, '$10 Card', 10);
  const vXbox50 = await getOrCreateVariant(prXboxUS.id, '$50 Card', 50);

  const vSteam20 = await getOrCreateVariant(prSteamGlobal.id, '$20 Card', 20);
  const vSteam50 = await getOrCreateVariant(prSteamGlobal.id, '$50 Card', 50);

  const vRoblox10 = await getOrCreateVariant(prRobloxGlobal.id, '$10 Card', 10);
  const vRoblox25 = await getOrCreateVariant(prRobloxGlobal.id, '$25 Card', 25);

  // Create fulfillment combinations (idempotent)
  async function getOrCreateCombination(variantId: string, name: string, priority: number, items: { denominationId: string; quantity: number }[]) {
    const existing = await prisma.fulfillmentCombination.findFirst({
      where: { variantId, name },
      include: { items: true },
    });
    if (existing) return existing;
    return prisma.fulfillmentCombination.create({
      data: { variantId, name, priority, items: { create: items } },
      include: { items: true },
    });
  }

  // PSN $50: Primary = 1×$50, Fallback = 2×$25, Fallback2 = 5×$10
  await getOrCreateCombination(vPsn50.id, '1×$50', 1, [{ denominationId: denominations['PSN-50'], quantity: 1 }]);
  await getOrCreateCombination(vPsn50.id, '2×$25', 2, [{ denominationId: denominations['PSN-25'], quantity: 2 }]);
  await getOrCreateCombination(vPsn50.id, '5×$10', 3, [{ denominationId: denominations['PSN-10'], quantity: 5 }]);

  // PSN $100: Primary = 1×$100, Fallback = 2×$50, Fallback2 = 4×$25
  await getOrCreateCombination(vPsn100.id, '1×$100', 1, [{ denominationId: denominations['PSN-100'], quantity: 1 }]);
  await getOrCreateCombination(vPsn100.id, '2×$50', 2, [{ denominationId: denominations['PSN-50'], quantity: 2 }]);
  await getOrCreateCombination(vPsn100.id, '4×$25', 3, [{ denominationId: denominations['PSN-25'], quantity: 4 }]);

  // PSN $25: Primary = 1×$25, Fallback = 2×$10 + 1×$5 (but no $5, so only 1×$25)
  await getOrCreateCombination(vPsn25.id, '1×$25', 1, [{ denominationId: denominations['PSN-25'], quantity: 1 }]);

  // PSN $10: Primary = 1×$10
  await getOrCreateCombination(vPsn10.id, '1×$10', 1, [{ denominationId: denominations['PSN-10'], quantity: 1 }]);

  // Xbox $50: Primary = 1×$50, Fallback = 2×$25
  await getOrCreateCombination(vXbox50.id, '1×$50', 1, [{ denominationId: denominations['Xbox-50'], quantity: 1 }]);
  await getOrCreateCombination(vXbox50.id, '2×$25', 2, [{ denominationId: denominations['Xbox-25'], quantity: 2 }]);

  // Xbox $10: Primary = 1×$10
  await getOrCreateCombination(vXbox10.id, '1×$10', 1, [{ denominationId: denominations['Xbox-10'], quantity: 1 }]);

  // Steam $20: Primary = 1×$20
  await getOrCreateCombination(vSteam20.id, '1×$20', 1, [{ denominationId: denominations['Steam-20'], quantity: 1 }]);

  // Steam $50: Primary = 1×$50, Fallback = 2×$20 + 1×$10
  await getOrCreateCombination(vSteam50.id, '1×$50', 1, [{ denominationId: denominations['Steam-50'], quantity: 1 }]);
  await getOrCreateCombination(vSteam50.id, '2×$20+1×$10', 2, [
    { denominationId: denominations['Steam-20'], quantity: 2 },
    { denominationId: denominations['Steam-10'], quantity: 1 },
  ]);

  // Roblox $10: Primary = 1×$10
  await getOrCreateCombination(vRoblox10.id, '1×$10', 1, [{ denominationId: denominations['Roblox-10'], quantity: 1 }]);

  // Roblox $25: Primary = 1×$25, Fallback = 2×$10 + 1×$5 (no $5, so fallback won't work)
  await getOrCreateCombination(vRoblox25.id, '1×$25', 1, [{ denominationId: denominations['Roblox-25'], quantity: 1 }]);

  console.log('✓ Catalog seed data created (categories, regions, variants, combinations)');

  console.log('Seed complete!');
  console.log('Admin login: admin@digitalcode.local / Admin123!@#');
  console.log('Merchant login: merchant@test.com / Merchant123!@#');
  if (!process.env.ENCRYPTION_KEY) {
    console.log('Encryption key was generated and saved to .env.generated');
  }
  console.log(`Merchant ID: ${merchant.id}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
