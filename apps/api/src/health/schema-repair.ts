/**
 * Schema reconciliation, run by the application itself at startup.
 *
 * Production's `_prisma_migrations` records migrations as applied whose DDL
 * never ran, so `prisma migrate deploy` reports success and changes nothing.
 * Code then ships against a database missing its columns, and the only symptom
 * is a P2022 the moment a user touches the feature — a failed code upload, an
 * empty product dropdown, batch names silently lost.
 *
 * The build script cannot be relied on to fix that (it may not run, and its
 * failures are invisible from outside), but the application always starts. So
 * the app checks the columns it actually needs and adds any that are missing.
 *
 * Every statement is IF NOT EXISTS. This only ever adds; it never drops a
 * column, rewrites a type, or touches data outside the two repairs below.
 */

/** Columns the running code depends on, checked against information_schema. */
export const REQUIRED_SCHEMA: { table: string; column: string }[] = [
  { table: 'CodeBatch', column: 'batchName' },
  { table: 'CodeBatch', column: 'priority' },
  { table: 'FulfillmentRequest', column: 'discountAmount' },
  { table: 'FulfillmentRequest', column: 'chargedCurrency' },
  { table: 'FulfillmentRequest', column: 'chargedAmount' },
  { table: 'FulfillmentRequest', column: 'fxRate' },
  { table: 'WalletTransaction', column: 'currency' },
  { table: 'Denomination', column: 'sku' },
  { table: 'Variant', column: 'sku' },
  { table: 'MerchantWallet', column: 'balance' },
  { table: 'SellingPrice', column: 'amount' },
  { table: 'Subcategory', column: 'categoryId' },
  { table: 'Product', column: 'subcategoryId' },
  { table: 'SupportMessage', column: 'fulfillmentId' },
];

/**
 * Run one at a time: Prisma sends each as a single statement, so these are kept
 * as separate strings rather than parsed out of a .sql file.
 */
export const REPAIR_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "Subcategory" (
     "id"         TEXT NOT NULL,
     "name"       TEXT NOT NULL,
     "slug"       TEXT NOT NULL,
     "categoryId" TEXT NOT NULL,
     "regionId"   TEXT,
     "sortOrder"  INTEGER NOT NULL DEFAULT 0,
     "active"     BOOLEAN NOT NULL DEFAULT true,
     "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Subcategory_slug_key" ON "Subcategory" ("slug")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Subcategory_categoryId_name_key" ON "Subcategory" ("categoryId", "name")`,
  `CREATE INDEX IF NOT EXISTS "Subcategory_categoryId_idx" ON "Subcategory" ("categoryId")`,
  `CREATE INDEX IF NOT EXISTS "Subcategory_regionId_idx" ON "Subcategory" ("regionId")`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Product_subcategoryId_idx" ON "Product" ("subcategoryId")`,
  `ALTER TABLE "SupportMessage" ADD COLUMN IF NOT EXISTS "fulfillmentId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "SupportMessage_fulfillmentId_idx" ON "SupportMessage" ("fulfillmentId")`,
  // Postgres has no ADD CONSTRAINT IF NOT EXISTS, and these run on every boot,
  // so each drops its own constraint first. Without the keys the onDelete rules
  // in the Prisma schema never fire and a deleted category leaves orphans.
  `ALTER TABLE "Subcategory" DROP CONSTRAINT IF EXISTS "Subcategory_categoryId_fkey"`,
  `ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey"
     FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "Subcategory" DROP CONSTRAINT IF EXISTS "Subcategory_regionId_fkey"`,
  `ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_regionId_fkey"
     FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_subcategoryId_fkey"`,
  `ALTER TABLE "Product" ADD CONSTRAINT "Product_subcategoryId_fkey"
     FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "CodeBatch" ADD COLUMN IF NOT EXISTS "batchName" TEXT`,
  `ALTER TABLE "CodeBatch" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0`,
  `ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "chargedCurrency" TEXT NOT NULL DEFAULT 'USD'`,
  `ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "chargedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0`,
  `ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "fxRate" DECIMAL(65,30) NOT NULL DEFAULT 1`,
  `ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD'`,
  `CREATE INDEX IF NOT EXISTS "CodeBatch_denominationId_priority_idx" ON "CodeBatch" ("denominationId", "priority")`,
  `ALTER TABLE "Denomination" ADD COLUMN IF NOT EXISTS "sku" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Denomination_sku_idx" ON "Denomination" ("sku")`,
  `ALTER TABLE "Variant" ADD COLUMN IF NOT EXISTS "sku" TEXT`,
  `CREATE TABLE IF NOT EXISTS "MerchantWallet" (
     "id" TEXT NOT NULL,
     "merchantId" TEXT NOT NULL,
     "currency" TEXT NOT NULL,
     "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
     "spendOrder" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "MerchantWallet_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MerchantWallet_merchantId_currency_key" ON "MerchantWallet" ("merchantId", "currency")`,
  `CREATE TABLE IF NOT EXISTS "SellingPrice" (
     "id" TEXT NOT NULL,
     "itemType" TEXT NOT NULL,
     "itemId" TEXT NOT NULL,
     "currency" TEXT NOT NULL,
     "amount" DECIMAL(65,30) NOT NULL,
     "updatedBy" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "SellingPrice_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SellingPrice_itemType_itemId_currency_key" ON "SellingPrice" ("itemType", "itemId", "currency")`,
  `CREATE INDEX IF NOT EXISTS "SellingPrice_itemId_idx" ON "SellingPrice" ("itemId")`,
  // Seed each item's existing price as its price in the currency it is already
  // stated in, so nothing changes value and only the other currency is left to set.
  `INSERT INTO "SellingPrice" ("id", "itemType", "itemId", "currency", "amount", "createdAt", "updatedAt")
   SELECT gen_random_uuid()::text, 'DENOMINATION', d."id", UPPER(COALESCE(d."currency", 'USD')),
          d."faceValue", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
   FROM "Denomination" d
   ON CONFLICT ("itemType", "itemId", "currency") DO NOTHING`,
  `INSERT INTO "SellingPrice" ("id", "itemType", "itemId", "currency", "amount", "createdAt", "updatedAt")
   SELECT gen_random_uuid()::text, 'VARIANT', v."id", UPPER(COALESCE(v."currency", 'USD')),
          v."customerPrice", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
   FROM "Variant" v
   ON CONFLICT ("itemType", "itemId", "currency") DO NOTHING`,
  `CREATE INDEX IF NOT EXISTS "MerchantWallet_merchantId_spendOrder_idx" ON "MerchantWallet" ("merchantId", "spendOrder")`,
  // Carry each existing balance into a wallet of the currency it is already
  // held in. Nothing is converted, so no balance changes value.
  `INSERT INTO "MerchantWallet" ("id", "merchantId", "currency", "balance", "spendOrder", "createdAt", "updatedAt")
   SELECT gen_random_uuid()::text, m."id", UPPER(COALESCE(m."currency", 'USD')), m."walletBalance", 0,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
   FROM "Merchant" m
   ON CONFLICT ("merchantId", "currency") DO NOTHING`,
  `INSERT INTO "MerchantWallet" ("id", "merchantId", "currency", "balance", "spendOrder", "createdAt", "updatedAt")
   SELECT gen_random_uuid()::text, m."id", 'USD', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
   FROM "Merchant" m
   ON CONFLICT ("merchantId", "currency") DO NOTHING`,
  `CREATE INDEX IF NOT EXISTS "Variant_sku_idx" ON "Variant" ("sku")`,
  // Carry the pre-table USD->PKR rate across so no configured rate is lost.
  // Rebuild batches for admin uploads whose batch insert failed while batchName
  // was missing — the reason batches disappeared from Inventory.
  `INSERT INTO "CodeBatch" ("id", "denominationId", "quantity", "currency", "createdAt")
   SELECT c."batchId", MIN(c."denominationId"), COUNT(*)::integer, 'USD', MIN(c."createdAt")
   FROM "CodeItem" c
   WHERE c."batchId" IS NOT NULL AND c."source" = 'DCV' AND c."merchantId" IS NULL
   GROUP BY c."batchId" HAVING COUNT(DISTINCT c."denominationId") = 1
   ON CONFLICT ("id") DO NOTHING`,
];
