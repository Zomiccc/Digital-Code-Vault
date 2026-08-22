const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const fulfillments = await p.fulfillmentRequest.findMany({
    where: { referenceId: { in: ['7328', '7329', '7330'] } },
    include: { deliveryToken: true },
  });
  for (const f of fulfillments) {
    console.log('---');
    console.log('referenceId:', f.referenceId, '| status:', f.status, '| customerEmail:', JSON.stringify(f.customerEmail));
    console.log('deliveryToken exists:', !!f.deliveryToken, '| tokenHash:', f.deliveryToken?.tokenHash);
  }
  if (fulfillments.length === 0) console.log('No fulfillments found for these reference IDs.');
  await p.$disconnect();
})();
