require('dotenv').config({ path: '.env.dev' });
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

async function main() {
  const prisma = new PrismaClient();
  try {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex) {
      console.log('ENCRYPTION_KEY not found in .env.dev');
      return;
    }
    const key = Buffer.from(keyHex, 'hex');

    const denom = await prisma.denomination.findFirst({
      include: { product: true },
    });
    if (!denom) {
      console.log('No denomination found. Create a product/denomination first.');
      return;
    }

    const codes = [
      'PSN-USA-10-DEMO-0001',
      'PSN-USA-10-DEMO-0002',
      'PSN-USA-10-DEMO-0003',
      'PSN-USA-10-DEMO-0004',
      'PSN-USA-10-DEMO-0005',
    ];

    const created = [];
    for (const code of codes) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const encryptedCode = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      const item = await prisma.codeItem.create({
        data: {
          denominationId: denom.id,
          encryptedCode,
          codeHash,
          status: 'AVAILABLE',
          batchId: `batch-${Date.now()}`,
        },
      });
      created.push(item.id);
    }

    console.log(`Created ${created.length} codes for ${denom.product.name} ($${denom.faceValue}):`);
    console.log('Demo code IDs:', created);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
