const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const dt = await p.deliveryToken.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { fulfillment: true },
  });
  if (!dt) {
    console.log('No delivery tokens found');
  } else {
    console.log('DeliveryToken id:', dt.id);
    console.log('tokenHash:', dt.tokenHash);
    console.log('fulfillmentId:', dt.fulfillmentId);
    console.log('revealedAt:', dt.revealedAt);
    console.log('fulfillment status:', dt.fulfillment.status);
  }
  await p.$disconnect();
})();
