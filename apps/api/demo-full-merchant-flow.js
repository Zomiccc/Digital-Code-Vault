require('dotenv').config({ path: '.env.dev' });
const API = 'http://localhost:3000/api/v1';

async function merchantLogin() {
  const res = await fetch(`${API}/auth/merchant/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'merchant@test.com', password: 'Merchant123!@#' }),
  });
  if (!res.ok) throw new Error(`Login failed: ${await res.text()}`);
  return res.json();
}

async function createApiKey(accessToken) {
  const res = await fetch(`${API}/merchant/api-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ scopes: ['fulfillment', 'read'] }),
  });
  if (!res.ok) throw new Error(`API key creation failed: ${await res.text()}`);
  return res.json();
}

async function createFulfillment(apiKey, productId, amount) {
  const res = await fetch(`${API}/fulfillment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'Idempotency-Key': `demo-${Date.now()}`,
    },
    body: JSON.stringify({ product_id: productId, amount }),
  });
  if (!res.ok) throw new Error(`Fulfillment failed: ${await res.text()}`);
  return res.json();
}

async function getDeliveryLink(apiKey, fulfillmentId) {
  const res = await fetch(`${API}/fulfillment/${fulfillmentId}/delivery-link`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) throw new Error(`Delivery link failed: ${await res.text()}`);
  return res.json();
}

async function getProductAndDenomination() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const product = await prisma.product.findFirst({
      include: { denominations: true },
    });
    if (!product) throw new Error('No product found');
    return { product, denomination: product.denominations[0] };
  } finally {
    await prisma.$disconnect();
  }
}

async function seedCodes(denominationId, count = 5) {
  const { PrismaClient } = require('@prisma/client');
  const crypto = require('crypto');
  const prisma = new PrismaClient();
  try {
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const created = [];
    for (let i = 1; i <= count; i++) {
      const code = `PSN-USA-10-FLOW-${String(i).padStart(4, '0')}`;
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const encryptedCode = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      const item = await prisma.codeItem.create({
        data: {
          denominationId,
          encryptedCode,
          codeHash,
          status: 'AVAILABLE',
          batchId: `batch-${Date.now()}-${i}`,
        },
      });
      created.push(item.id);
    }
    return created;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log('=== Full Merchant-to-Customer Flow Demo ===\n');

  // 1. Get first product and denomination from DB
  const { product, denomination: denom } = await getProductAndDenomination();
  console.log('Product:', product.name, `(${product.region})`);
  console.log('Denomination:', denom.faceValue, denom.currency);

  // 2. Seed codes
  const codeIds = await seedCodes(denom.id, 5);
  console.log('\nSeeded', codeIds.length, 'codes');

  // 3. Login merchant
  const { access_token } = await merchantLogin();
  console.log('\nMerchant login OK');

  // 4. Create API key
  const apiKeyData = await createApiKey(access_token);
  const apiKey = apiKeyData.key;
  if (!apiKey) throw new Error('No API key returned: ' + JSON.stringify(apiKeyData));
  console.log('API key created:', apiKey.slice(0, 20) + '...');

  // 5. Create fulfillment
  const fulfillment = await createFulfillment(apiKey, product.id, denom.faceValue);
  console.log('\nFulfillment created:', fulfillment.id);
  console.log('Status:', fulfillment.status);

  // 6. Get delivery link
  const delivery = await getDeliveryLink(apiKey, fulfillment.id);
  console.log('\nDelivery token:', delivery.token || delivery.deliveryToken);

  const token = delivery.token || delivery.deliveryToken;
  const portalLink = `http://localhost:5175/d/${token}`;
  const apiLink = `http://localhost:3000/d/${token}`;

  console.log('\n=== LINKS ===');
  console.log('Customer Portal:', portalLink);
  console.log('API delivery info:', apiLink);
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
