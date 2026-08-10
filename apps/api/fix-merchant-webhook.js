const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const merchant = await prisma.merchant.findFirst({
    where: { email: 'merchant@test.com' },
  });
  if (!merchant) {
    console.log('Merchant not found');
    return;
  }
  
  if (!merchant.webhookSecret) {
    const secret = 'whsec_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { webhookSecret: secret },
    });
    console.log('Webhook secret set:', secret);
  } else {
    console.log('Webhook secret already exists:', merchant.webhookSecret);
  }
  
  // Also check if there are connected products, if not create one for PSN-USD-50
  const connected = await prisma.connectedProduct.findMany({
    where: { merchantId: merchant.id },
  });
  console.log('Connected products:', connected.length);
  
  if (connected.length === 0) {
    // Find PSN product and its $50 denomination
    const psn = await prisma.product.findFirst({ where: { name: 'PSN' } });
    if (!psn) {
      console.log('PSN product not found');
      return;
    }
    
    const denom = await prisma.denomination.findFirst({
      where: { productId: psn.id, faceValue: 50 },
    });
    
    if (!denom) {
      console.log('PSN $50 denomination not found');
      return;
    }
    
    const cp = await prisma.connectedProduct.create({
      data: {
        merchantId: merchant.id,
        sku: 'PSN-USD-50',
        externalName: 'PSN $50',
        productId: psn.id,
        denominationId: denom.id,
        inventorySource: 'DCV',
      },
    });
    console.log('Connected product created:', cp.id, 'SKU:', cp.sku);
  } else {
    console.log('Connected products already exist');
    for (const cp of connected) {
      console.log('  SKU:', cp.sku, 'Product:', cp.productId, 'Denom:', cp.denominationId);
    }
  }
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
