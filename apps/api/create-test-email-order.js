require('dotenv').config({ path: '../../.env' });
const crypto = require('crypto');
const argon2 = require('argon2');
const { nanoid } = require('nanoid');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Find a merchant with wallet balance
  const merchant = await prisma.merchant.findFirst({
    where: { status: 'ACTIVE' },
  });

  if (!merchant) {
    console.error('No active merchant found');
    process.exit(1);
  }

  console.log(`Merchant: ${merchant.name} (${merchant.id})`);
  console.log(`Wallet balance: ${merchant.walletBalance}`);

  // 2. Create a new API key for this merchant
  const keyId = `pk_${nanoid(24)}`;
  const secret = nanoid(48);
  const fullKey = `${keyId}.${secret}`;
  const keyPrefix = keyId.substring(0, 12);
  const keyHash = await argon2.hash(fullKey);

  await prisma.apiKey.create({
    data: {
      merchantId: merchant.id,
      keyPrefix,
      keyHash,
      scopes: JSON.stringify(['fulfillment', 'read']),
      status: 'ACTIVE',
    },
  });

  console.log(`Created API key: ${fullKey.substring(0, 20)}...`);

  // 3. Find a product with available codes
  const products = await prisma.product.findMany({ take: 10 });
  let chosenProduct = null;
  let chosenDenomination = null;

  for (const p of products) {
    const denoms = await prisma.denomination.findMany({ where: { productId: p.id } });
    for (const d of denoms) {
      const availableCode = await prisma.codeItem.findFirst({
        where: { denominationId: d.id, status: 'AVAILABLE' },
      });
      if (availableCode) {
        chosenProduct = p;
        chosenDenomination = d;
        break;
      }
    }
    if (chosenProduct) break;
  }

  if (!chosenProduct) {
    console.error('No product with available codes found');
    process.exit(1);
  }

  console.log(`Product: ${chosenProduct.name} (${chosenProduct.id})`);
  console.log(`Denomination: $${chosenDenomination.faceValue} (${chosenDenomination.id})`);

  // 4. Build the HMAC-signed request
  const body = JSON.stringify({
    product_id: chosenProduct.id,
    amount: Number(chosenDenomination.faceValue),
    currency: 'USD',
    reference_id: `TEST-${Date.now()}`,
    customer_email: 'ashir.qureshi.aqq@gmail.com',
    customer_name: 'Ashir Qureshi',
    customer_address: 'Test Address',
  });

  const method = 'POST';
  const path = '/api/v1/fulfillment';
  const timestamp = Date.now().toString();
  const data = `${method}\n${path}\n${body}\n${timestamp}`;
  const signature = crypto.createHmac('sha256', fullKey).update(data).digest('hex');

  // 5. Send the request
  const http = require('http');
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: path,
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': fullKey,
      'X-Signature': signature,
      'X-Timestamp': timestamp,
      'Idempotency-Key': `test-email-${Date.now()}`,
    },
  };

  console.log('\nSending fulfillment request...');
  console.log(`Customer email: ashir.qureshi.aqq@gmail.com`);

  const req = http.request(options, (res) => {
    let responseData = '';
    res.on('data', (chunk) => (responseData += chunk));
    res.on('end', () => {
      console.log(`\nHTTP Status: ${res.statusCode}`);
      try {
        const parsed = JSON.parse(responseData);
        console.log('Response:', JSON.stringify(parsed, null, 2));
        if (parsed.delivery_link) {
          console.log(`\n✅ Delivery link: ${parsed.delivery_link}`);
          console.log('Check your email at ashir.qureshi.aqq@gmail.com');
        }
      } catch {
        console.log('Response (raw):', responseData);
      }

      // Cleanup: revoke the test API key
      prisma.apiKey.update({
        where: { keyPrefix },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }).then(() => {
        console.log('\nTest API key revoked.');
        process.exit(0);
      }).catch(() => process.exit(0));
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e.message);
    process.exit(1);
  });

  req.write(body);
  req.end();
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
