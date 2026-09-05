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
  { table: 'ExchangeRate', column: 'unitsPerUsd' },
];

/**
 * Run one at a time: Prisma sends each as a single statement, so these are kept
 * as separate strings rather than parsed out of a .sql file.
 */
export const REPAIR_STATEMENTS: string[] = [
  `ALTER TABLE "CodeBatch" ADD COLUMN IF NOT EXISTS "batchName" TEXT`,
  `ALTER TABLE "CodeBatch" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0`,
  `ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "chargedCurrency" TEXT NOT NULL DEFAULT 'USD'`,
  `ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "chargedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0`,
  `ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "fxRate" DECIMAL(65,30) NOT NULL DEFAULT 1`,
  `ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD'`,
  `CREATE TABLE IF NOT EXISTS "ExchangeRate" (
     "currency" TEXT NOT NULL,
     "unitsPerUsd" DECIMAL(65,30) NOT NULL,
     "updatedBy" TEXT,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("currency")
   )`,
  `CREATE INDEX IF NOT EXISTS "CodeBatch_denominationId_priority_idx" ON "CodeBatch" ("denominationId", "priority")`,
  // Carry the pre-table USD->PKR rate across so no configured rate is lost.
  `INSERT INTO "ExchangeRate" ("currency", "unitsPerUsd", "updatedAt")
   SELECT 'PKR', "value"::decimal, CURRENT_TIMESTAMP FROM "PlatformSetting"
   WHERE "key" = 'USD_TO_PKR_RATE' AND "value" ~ '^[0-9]+(\\.[0-9]+)?$'
   ON CONFLICT ("currency") DO NOTHING`,
  // Rebuild batches for admin uploads whose batch insert failed while batchName
  // was missing — the reason batches disappeared from Inventory.
  `INSERT INTO "CodeBatch" ("id", "denominationId", "quantity", "currency", "createdAt")
   SELECT c."batchId", MIN(c."denominationId"), COUNT(*)::integer, 'USD', MIN(c."createdAt")
   FROM "CodeItem" c
   WHERE c."batchId" IS NOT NULL AND c."source" = 'DCV' AND c."merchantId" IS NULL
   GROUP BY c."batchId" HAVING COUNT(DISTINCT c."denominationId") = 1
   ON CONFLICT ("id") DO NOTHING`,
];
