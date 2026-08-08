const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Cleaning up duplicate products and suppliers ===\n');

  // Identify canonical (first created) vs duplicate (later created) by createdAt
  const products = await prisma.product.findMany({
    include: { denominations: true },
    orderBy: { createdAt: 'asc' },
  });

  const suppliers = await prisma.supplier.findMany({
    include: { _count: { select: { products: true, codeItems: true } } },
    orderBy: { createdAt: 'asc' },
  });

  // Group products by name+region, keep first as canonical
  const productGroups = new Map();
  for (const p of products) {
    const key = `${p.name}|${p.region}`;
    if (!productGroups.has(key)) {
      productGroups.set(key, { canonical: p, duplicates: [] });
    } else {
      productGroups.get(key).duplicates.push(p);
    }
  }

  // Group suppliers by name, keep first as canonical
  const supplierGroups = new Map();
  for (const s of suppliers) {
    if (!supplierGroups.has(s.name)) {
      supplierGroups.set(s.name, { canonical: s, duplicates: [] });
    } else {
      supplierGroups.get(s.name).duplicates.push(s);
    }
  }

  let movedCodeItems = 0;
  let deletedDenominations = 0;
  let deletedProducts = 0;
  let deletedSuppliers = 0;

  // 1. Merge duplicate products into canonical
  for (const [key, group] of productGroups) {
    if (group.duplicates.length === 0) continue;

    const canonical = group.canonical;
    console.log(`Product ${key}: canonical=${canonical.id}, duplicates=${group.duplicates.map(d => d.id).join(', ')}`);

    // Build map of faceValue -> canonical denomination id
    const canonicalDenomMap = new Map();
    for (const d of canonical.denominations) {
      canonicalDenomMap.set(d.faceValue, d.id);
    }

    for (const dup of group.duplicates) {
      for (const dupDenom of dup.denominations) {
        const targetDenomId = canonicalDenomMap.get(dupDenom.faceValue);
        if (!targetDenomId) {
          console.log(`  No matching denomination for faceValue ${dupDenom.faceValue} on canonical product — skipping`);
          continue;
        }

        // Move code items from duplicate denomination to canonical denomination
        const moved = await prisma.codeItem.updateMany({
          where: { denominationId: dupDenom.id },
          data: { denominationId: targetDenomId },
        });
        movedCodeItems += moved.count;
        console.log(`  Moved ${moved.count} code items from denom ${dupDenom.id} to ${targetDenomId}`);

        // Delete duplicate denomination
        await prisma.denomination.delete({ where: { id: dupDenom.id } });
        deletedDenominations++;
      }

      // Delete duplicate product
      await prisma.product.delete({ where: { id: dup.id } });
      deletedProducts++;
    }
  }

  // 2. Merge duplicate suppliers into canonical
  for (const [name, group] of supplierGroups) {
    if (group.duplicates.length === 0) continue;

    const canonical = group.canonical;
    console.log(`Supplier ${name}: canonical=${canonical.id}, duplicates=${group.duplicates.map(d => d.id).join(', ')}`);

    for (const dup of group.duplicates) {
      // Move code items and products to canonical supplier
      const movedCodeItemsRes = await prisma.codeItem.updateMany({
        where: { supplierId: dup.id },
        data: { supplierId: canonical.id },
      });
      const movedProductsRes = await prisma.product.updateMany({
        where: { supplierId: dup.id },
        data: { supplierId: canonical.id },
      });
      movedCodeItems += movedCodeItemsRes.count;
      console.log(`  Moved ${movedCodeItemsRes.count} code items and ${movedProductsRes.count} products to canonical supplier`);

      // Delete duplicate supplier
      await prisma.supplier.delete({ where: { id: dup.id } });
      deletedSuppliers++;
    }
  }

  // 3. Update merchant allowedProductIds to canonical IDs
  const merchants = await prisma.merchant.findMany();
  for (const m of merchants) {
    const allowedIds = JSON.parse(m.allowedProductIds || '[]');
    const updatedIds = allowedIds.map((id) => {
      for (const [key, group] of productGroups) {
        if (group.duplicates.some((d) => d.id === id)) {
          return group.canonical.id;
        }
      }
      return id;
    });

    const changed = JSON.stringify(allowedIds) !== JSON.stringify(updatedIds);
    if (changed) {
      await prisma.merchant.update({
        where: { id: m.id },
        data: { allowedProductIds: JSON.stringify(updatedIds) },
      });
      console.log(`Updated merchant ${m.email} allowedProductIds`);
    }
  }

  console.log('\n=== Cleanup complete ===');
  console.log(`Moved ${movedCodeItems} code items`);
  console.log(`Deleted ${deletedDenominations} duplicate denominations`);
  console.log(`Deleted ${deletedProducts} duplicate products`);
  console.log(`Deleted ${deletedSuppliers} duplicate suppliers`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
