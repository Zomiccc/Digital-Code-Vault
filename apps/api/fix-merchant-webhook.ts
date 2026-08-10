process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const merchant = await prisma.merchant.findFirst({
    where: { email: 'merchant@test.com' },
  });
  if (!merchant) {
    console.log('Merchant not found');
    return;
  }
  console.log('Merchant:', merchant.name, 'ID:', merchant.id);
  console.log('Webhook Secret:', merchant.webhookSecret || '(empty)');

  if (!merchant.webhookSecret) {
    const secret = 'whsec_demo_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { webhookSecret: secret },
    });
    console.log('Webhook secret SET:', secret);
  }

  // Check connected products
  const connected = await prisma.connectedProduct.findMany({
    where: { merchantId: merchant.id },
  });
  console.log('Connected products:', connected.length);
  for (const cp of connected) {
    console.log('  SKU:', cp.platformSku, 'Name:', cp.name, 'DCVProduct:', cp.dcvProductId, 'DCVDenom:', cp.dcvDenominationId, 'Source:', cp.inventorySource);
  }

  if (connected.length === 0) {
    // Find PSN product and its $50 denomination
    const psn = await prisma.product.findFirst({ where: { name: 'PSN' } });
    if (!psn) {
      console.log('PSN product not found');
      const allProducts = await prisma.product.findMany();
      console.log('Available products:', allProducts.map(p => p.name).join(', '));
      await prisma.$disconnect();
      return;
    }
    console.log('PSN product found:', psn.id);

    const denoms = await prisma.denomination.findMany({
      where: { productId: psn.id },
    });
    console.log('Denominations:', denoms.map(d => `$${d.faceValue}`).join(', '));

    const denom = denoms.find(d => Number(d.faceValue) === 50) || denoms[0];
    if (!denom) {
      console.log('No denomination found for PSN');
      await prisma.$disconnect();
      return;
    }
    console.log('Using denomination:', denom.id, '$' + denom.faceValue);

    const cp = await prisma.connectedProduct.create({
      data: {
        merchantId: merchant.id,
        platform: 'woocommerce',
        platformSku: 'PSN-USD-50',
        name: 'PSN $50',
        dcvProductId: psn.id,
        dcvDenominationId: denom.id,
        inventorySource: 'DCV',
      },
    });
    console.log('Connected product created:', cp.id, 'SKU:', cp.platformSku);
  }

  // Also check if there are any codes available for the PSN $50 denomination
  const psn = await prisma.product.findFirst({ where: { name: 'PSN' } });
  if (psn) {
    const denoms = await prisma.denomination.findMany({ where: { productId: psn.id } });
    for (const d of denoms) {
      const codes = await prisma.codeItem.count({
        where: { denominationId: d.id, status: 'AVAILABLE' },
      });
      console.log(`Available codes for $${d.faceValue}:`, codes);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
