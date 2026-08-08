const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.groupBy({
    by: ['name', 'region'],
    _count: { id: true },
  });
  console.log('Products by name/region:');
  products.forEach((x) => console.log(' ', x.name, x.region, 'count:', x._count.id));

  const suppliers = await prisma.supplier.groupBy({
    by: ['name'],
    _count: { id: true },
  });
  console.log('Suppliers by name:');
  suppliers.forEach((x) => console.log(' ', x.name, 'count:', x._count.id));

  const allProducts = await prisma.product.findMany({
    include: { denominations: true },
    orderBy: { name: 'asc' },
  });
  console.log('\nAll products:');
  allProducts.forEach((p) => {
    console.log(`  ${p.name} (${p.region}) [${p.id}] - ${p.denominations.length} denominations`);
  });

  const allSuppliers = await prisma.supplier.findMany({
    include: { _count: { select: { products: true, codeItems: true } } },
    orderBy: { name: 'asc' },
  });
  console.log('\nAll suppliers:');
  allSuppliers.forEach((s) => {
    console.log(`  ${s.name} [${s.id}] - ${s._count.products} products, ${s._count.codeItems} code items`);
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
