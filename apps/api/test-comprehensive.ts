import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { FulfillmentService } from './src/fulfillment/fulfillment.service';
import { PrismaService } from './src/prisma/prisma.service';
import { DeliveryService } from './src/delivery/delivery.service';
import { EncryptionService } from './src/encryption/encryption.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const fulfillmentService = app.get(FulfillmentService);
  const prisma = app.get(PrismaService);
  const deliveryService = app.get(DeliveryService);
  const encryptionService = app.get(EncryptionService);

  const merchantEmail = 'test-merchant@example.com';
  let merchant = await prisma.merchant.findUnique({ where: { email: merchantEmail } });
  if (!merchant) {
    merchant = await prisma.merchant.create({
      data: { name: 'Test Merchant', email: merchantEmail, walletBalance: 10000, status: 'ACTIVE' },
    });
  } else {
    merchant = await prisma.merchant.update({
      where: { id: merchant.id },
      data: { walletBalance: 10000, status: 'ACTIVE' },
    });
  }

  let passed = 0;
  let failed = 0;

  function logResult(testName: string, pass: boolean, detail: string) {
    const status = pass ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${testName}: ${detail}`);
    if (pass) passed++; else failed++;
  }

  // Helper to create product + denomination + codes
  async function setupProduct(
    name: string,
    productType: 'NORMAL' | 'ESSENTIALS',
    denoms: { faceValue: number; codes: string[] }[],
  ) {
    const product = await prisma.product.create({
      data: { name, region: 'USA', productType, status: 'ACTIVE' },
    });
    const denominationMap: Map<number, string> = new Map();
    for (const d of denoms) {
      const denom = await prisma.denomination.create({
        data: { productId: product.id, faceValue: d.faceValue, currency: 'USD' },
      });
      denominationMap.set(d.faceValue, denom.id);
      for (const code of d.codes) {
        const encrypted = encryptionService.encrypt(code);
        const codeHash = encryptionService.hashCode(code);
        await prisma.codeItem.create({
          data: { denominationId: denom.id, encryptedCode: encrypted, codeHash, status: 'AVAILABLE' },
        });
      }
    }
    return { product, denominationMap };
  }

  async function fulfillAndReveal(productId: string, amount: number, idempotencyKey: string) {
    const result = await fulfillmentService.createFulfillment({
      merchantId: merchant!.id,
      productId,
      amount,
      currency: 'USD',
      idempotencyKey,
      customerEmail: 'test-customer@example.com',
      customerName: 'Test Customer',
      actorType: 'SYSTEM',
      sandbox: true,
    });
    const token = result.delivery_link.split('/').pop()!;
    const revealed = await deliveryService.revealCode(token, '127.0.0.1');
    return { result, revealed };
  }

  // ─── TEST 1: NORMAL $10 → 1 code ───
  try {
    const { product } = await setupProduct('NORMAL $10 Test', 'NORMAL', [
      { faceValue: 10, codes: ['N10-AAA', 'N10-BBB'] },
    ]);
    const { result, revealed } = await fulfillAndReveal(product.id, 10, `test-normal-10-${Date.now()}`);
    const pass = revealed.codes.length === 1 && revealed.codes[0].code.startsWith('N10-') && revealed.codes[0].code.length > 0;
    logResult('NORMAL $10 → 1 code', pass, `codes: ${revealed.codes.map(c => c.code).join(', ')}`);
  } catch (e: any) {
    logResult('NORMAL $10 → 1 code', false, e.message);
  }

  // ─── TEST 2: NORMAL $50 → 1 code ───
  try {
    const { product } = await setupProduct('NORMAL $50 Test', 'NORMAL', [
      { faceValue: 50, codes: ['N50-AAA'] },
    ]);
    const { result, revealed } = await fulfillAndReveal(product.id, 50, `test-normal-50-${Date.now()}`);
    const pass = revealed.codes.length === 1 && revealed.codes[0].code === 'N50-AAA';
    logResult('NORMAL $50 → 1 code', pass, `codes: ${revealed.codes.map(c => c.code).join(', ')}`);
  } catch (e: any) {
    logResult('NORMAL $50 → 1 code', false, e.message);
  }

  // ─── TEST 3: ESSENTIALS $10 × 2 → 2 codes ───
  try {
    const { product, denominationMap } = await setupProduct('ESS $10x2 Test', 'ESSENTIALS', [
      { faceValue: 10, codes: ['E10-A', 'E10-B', 'E10-C'] },
    ]);
    // Configure delivery rule: $10 × 2
    await prisma.essentialsDeliveryItem.create({
      data: { productId: product.id, denominationId: denominationMap.get(10)!, quantity: 2 },
    });
    const { result, revealed } = await fulfillAndReveal(product.id, 20, `test-ess-10x2-${Date.now()}`);
    const pass = revealed.codes.length === 2 &&
      revealed.codes.every(c => c.code.startsWith('E10-') && c.code.length > 0) &&
      revealed.codes[0].code !== revealed.codes[1].code;
    logResult('ESSENTIALS $10×2 → 2 codes', pass, `codes: ${revealed.codes.map(c => c.code).join(', ')}`);
  } catch (e: any) {
    logResult('ESSENTIALS $10×2 → 2 codes', false, e.message);
  }

  // ─── TEST 4: ESSENTIALS $10×2 + $20×1 → 3 codes ───
  try {
    const { product, denominationMap } = await setupProduct('ESS 3-code Test', 'ESSENTIALS', [
      { faceValue: 10, codes: ['M10-A', 'M10-B', 'M10-C'] },
      { faceValue: 20, codes: ['M20-A', 'M20-B'] },
    ]);
    await prisma.essentialsDeliveryItem.createMany({
      data: [
        { productId: product.id, denominationId: denominationMap.get(10)!, quantity: 2 },
        { productId: product.id, denominationId: denominationMap.get(20)!, quantity: 1 },
      ],
    });
    const { result, revealed } = await fulfillAndReveal(product.id, 40, `test-ess-3code-${Date.now()}`);
    const pass = revealed.codes.length === 3 &&
      revealed.codes.filter(c => c.denomination === '$10').length === 2 &&
      revealed.codes.filter(c => c.denomination === '$20').length === 1 &&
      revealed.codes.every(c => c.code.length > 0);
    logResult('ESSENTIALS $10×2+$20×1 → 3 codes', pass, `codes: ${revealed.codes.map(c => `${c.denomination}:${c.code}`).join(', ')}`);
  } catch (e: any) {
    logResult('ESSENTIALS $10×2+$20×1 → 3 codes', false, e.message);
  }

  // ─── TEST 5: ESSENTIALS $5×1 + $10×2 + $25×1 → 4 codes ───
  try {
    const { product, denominationMap } = await setupProduct('ESS 4-code Test', 'ESSENTIALS', [
      { faceValue: 5, codes: ['S5-A', 'S5-B'] },
      { faceValue: 10, codes: ['S10-A', 'S10-B', 'S10-C'] },
      { faceValue: 25, codes: ['S25-A', 'S25-B'] },
    ]);
    await prisma.essentialsDeliveryItem.createMany({
      data: [
        { productId: product.id, denominationId: denominationMap.get(5)!, quantity: 1 },
        { productId: product.id, denominationId: denominationMap.get(10)!, quantity: 2 },
        { productId: product.id, denominationId: denominationMap.get(25)!, quantity: 1 },
      ],
    });
    const { result, revealed } = await fulfillAndReveal(product.id, 50, `test-ess-4code-${Date.now()}`);
    const pass = revealed.codes.length === 4 &&
      revealed.codes.filter(c => c.denomination === '$5').length === 1 &&
      revealed.codes.filter(c => c.denomination === '$10').length === 2 &&
      revealed.codes.filter(c => c.denomination === '$25').length === 1 &&
      revealed.codes.every(c => c.code.length > 0);
    logResult('ESSENTIALS $5×1+$10×2+$25×1 → 4 codes', pass, `codes: ${revealed.codes.map(c => `${c.denomination}:${c.code}`).join(', ')}`);
  } catch (e: any) {
    logResult('ESSENTIALS $5×1+$10×2+$25×1 → 4 codes', false, e.message);
  }

  // ─── TEST 6: Insufficient inventory → clean rejection, no partial ───
  try {
    const { product, denominationMap } = await setupProduct('ESS Insufficient Test', 'ESSENTIALS', [
      { faceValue: 10, codes: ['I10-A', 'I10-B'] },
      { faceValue: 20, codes: [] }, // no $20 codes
    ]);
    await prisma.essentialsDeliveryItem.createMany({
      data: [
        { productId: product.id, denominationId: denominationMap.get(10)!, quantity: 2 },
        { productId: product.id, denominationId: denominationMap.get(20)!, quantity: 1 },
      ],
    });
    try {
      await fulfillmentService.createFulfillment({
        merchantId: merchant!.id,
        productId: product.id,
        amount: 40,
        currency: 'USD',
        idempotencyKey: `test-insufficient-${Date.now()}`,
        customerEmail: 'test-customer@example.com',
        actorType: 'SYSTEM',
        sandbox: true,
      });
      logResult('Insufficient inventory → clean rejection', false, 'Should have thrown but did not');
    } catch (e: any) {
      // Verify no $10 codes were allocated
      const available10 = await prisma.codeItem.count({
        where: { denominationId: denominationMap.get(10)!, status: 'AVAILABLE' },
      });
      const pass = e.response?.code === 'INSUFFICIENT_STOCK' && available10 === 2;
      logResult('Insufficient inventory → clean rejection', pass, `error: ${e.response?.code}, $10 still available: ${available10}/2`);
    }
  } catch (e: any) {
    logResult('Insufficient inventory → clean rejection', false, e.message);
  }

  // ─── TEST 7: Duplicate webhook / idempotency ───
  try {
    const { product } = await setupProduct('Idempotency Test', 'NORMAL', [
      { faceValue: 25, codes: ['ID25-A', 'ID25-B'] },
    ]);
    const idemKey = `test-idemp-${Date.now()}`;
    const r1 = await fulfillmentService.createFulfillment({
      merchantId: merchant!.id,
      productId: product.id,
      amount: 25,
      currency: 'USD',
      idempotencyKey: idemKey,
      customerEmail: 'test-customer@example.com',
      actorType: 'SYSTEM',
      sandbox: true,
    });
    const r2 = await fulfillmentService.createFulfillment({
      merchantId: merchant!.id,
      productId: product.id,
      amount: 25,
      currency: 'USD',
      idempotencyKey: idemKey,
      customerEmail: 'test-customer@example.com',
      actorType: 'SYSTEM',
      sandbox: true,
    });
    const pass = r1.fulfillment_id === r2.fulfillment_id;
    logResult('Duplicate webhook → same fulfillment', pass, `r1: ${r1.fulfillment_id.slice(0, 8)}, r2: ${r2.fulfillment_id.slice(0, 8)}`);
  } catch (e: any) {
    logResult('Duplicate webhook → same fulfillment', false, e.message);
  }

  // ─── TEST 8: ESSENTIALS with custom $30 denomination (not hard-coded) ───
  try {
    const { product, denominationMap } = await setupProduct('ESS Custom $30 Test', 'ESSENTIALS', [
      { faceValue: 30, codes: ['C30-A', 'C30-B'] },
      { faceValue: 15, codes: ['C15-A', 'C15-B'] },
    ]);
    await prisma.essentialsDeliveryItem.createMany({
      data: [
        { productId: product.id, denominationId: denominationMap.get(30)!, quantity: 1 },
        { productId: product.id, denominationId: denominationMap.get(15)!, quantity: 2 },
      ],
    });
    const { result, revealed } = await fulfillAndReveal(product.id, 60, `test-ess-custom30-${Date.now()}`);
    const pass = revealed.codes.length === 3 &&
      revealed.codes.filter(c => c.denomination === '$30').length === 1 &&
      revealed.codes.filter(c => c.denomination === '$15').length === 2;
    logResult('ESSENTIALS custom $30×1+$15×2 → 3 codes', pass, `codes: ${revealed.codes.map(c => `${c.denomination}:${c.code}`).join(', ')}`);
  } catch (e: any) {
    logResult('ESSENTIALS custom $30×1+$15×2 → 3 codes', false, e.message);
  }

  // ─── TEST 9: No partial delivery — exhaust inventory mid-bundle ───
  try {
    const { product, denominationMap } = await setupProduct('No Partial Test', 'ESSENTIALS', [
      { faceValue: 10, codes: ['P10-A'] }, // only 1 available, but rule needs 2
      { faceValue: 20, codes: ['P20-A', 'P20-B'] },
    ]);
    await prisma.essentialsDeliveryItem.createMany({
      data: [
        { productId: product.id, denominationId: denominationMap.get(10)!, quantity: 2 },
        { productId: product.id, denominationId: denominationMap.get(20)!, quantity: 1 },
      ],
    });
    try {
      await fulfillmentService.createFulfillment({
        merchantId: merchant!.id,
        productId: product.id,
        amount: 40,
        currency: 'USD',
        idempotencyKey: `test-no-partial-${Date.now()}`,
        customerEmail: 'test-customer@example.com',
        actorType: 'SYSTEM',
        sandbox: true,
      });
      logResult('No partial delivery on insufficient', false, 'Should have thrown');
    } catch (e: any) {
      // Verify $20 codes untouched
      const available20 = await prisma.codeItem.count({
        where: { denominationId: denominationMap.get(20)!, status: 'AVAILABLE' },
      });
      const pass = e.response?.code === 'INSUFFICIENT_STOCK' && available20 === 2;
      logResult('No partial delivery on insufficient', pass, `error: ${e.response?.code}, $20 untouched: ${available20}/2`);
    }
  } catch (e: any) {
    logResult('No partial delivery on insufficient', false, e.message);
  }

  // ─── SUMMARY ───
  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  await app.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
