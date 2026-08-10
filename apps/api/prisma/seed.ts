import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
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
