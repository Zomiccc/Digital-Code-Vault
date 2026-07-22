const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const available = await prisma.codeItem.findFirst({
    where: { status: 'AVAILABLE' },
    select: { id: true, encryptedCode: true, status: true },
  });

  if (!available) {
    console.log('No AVAILABLE code found in database.');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('DEMO CODE ID:', available.id);
  console.log('Encrypted in DB:', available.encryptedCode.substring(0, 60) + '...');
  console.log('Status:', available.status);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
