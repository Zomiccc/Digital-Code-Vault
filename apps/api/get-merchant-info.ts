import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config({ path: '../../.env' });
config({ path: '.env' });

const prisma = new PrismaClient();

async function main() {
  const merchant = await prisma.merchant.findFirst({
    where: { email: 'merchant@test.com' },
  });
  if (!merchant) {
    console.error('Merchant not found');
    return;
  }
  console.log('Merchant ID:', merchant.id);
  console.log('Webhook Secret:', merchant.webhookSecret);
  console.log('Wallet Balance:', merchant.walletBalance);
}

main().finally(() => prisma.$disconnect());
