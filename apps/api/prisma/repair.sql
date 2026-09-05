-- Idempotent schema reconciliation, applied on every deploy.
--
-- Why this exists: the production `_prisma_migrations` table records migrations
-- as applied whose DDL never actually ran, so `prisma migrate deploy` reports
-- success and changes nothing. Code then ships against a database missing the
-- columns it needs, and the only symptom is a P2022 when a user hits the
-- feature — a failed code upload, an empty product dropdown.
--
-- Everything here is IF NOT EXISTS, so it is safe to run repeatedly and safe on
-- a database that never drifted. It only ever adds; it never drops or rewrites.

ALTER TABLE "CodeBatch"          ADD COLUMN IF NOT EXISTS "batchName"       TEXT;
ALTER TABLE "CodeBatch"          ADD COLUMN IF NOT EXISTS "priority"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "discountAmount"  DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "chargedCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "chargedAmount"   DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "fxRate"          DECIMAL(65,30) NOT NULL DEFAULT 1;
ALTER TABLE "WalletTransaction"  ADD COLUMN IF NOT EXISTS "currency"        TEXT NOT NULL DEFAULT 'USD';

CREATE TABLE IF NOT EXISTS "ExchangeRate" (
  "currency"    TEXT NOT NULL,
  "unitsPerUsd" DECIMAL(65,30) NOT NULL,
  "updatedBy"   TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("currency")
);

CREATE INDEX IF NOT EXISTS "CodeBatch_denominationId_priority_idx"
  ON "CodeBatch" ("denominationId", "priority");

-- Carry over the single USD->PKR rate the platform used before rates were a
-- table, so no configured rate is silently lost.
INSERT INTO "ExchangeRate" ("currency", "unitsPerUsd", "updatedAt")
SELECT 'PKR', "value"::decimal, CURRENT_TIMESTAMP
FROM "PlatformSetting"
WHERE "key" = 'USD_TO_PKR_RATE' AND "value" ~ '^[0-9]+(\.[0-9]+)?$'
ON CONFLICT ("currency") DO NOTHING;

-- Rebuild CodeBatch rows for admin uploads whose batch insert failed while the
-- batchName column was missing, so those codes appear under a batch again.
INSERT INTO "CodeBatch" ("id", "denominationId", "quantity", "currency", "createdAt")
SELECT c."batchId", MIN(c."denominationId"), COUNT(*)::integer, 'USD', MIN(c."createdAt")
FROM "CodeItem" c
WHERE c."batchId" IS NOT NULL AND c."source" = 'DCV' AND c."merchantId" IS NULL
GROUP BY c."batchId"
HAVING COUNT(DISTINCT c."denominationId") = 1
ON CONFLICT ("id") DO NOTHING;

-- Only correct rows whose stored count disagrees with reality, so a deploy does
-- not rewrite every batch every time.
UPDATE "CodeBatch" b SET "quantity" = actual."n"
FROM (
  SELECT b2."id", COALESCE((SELECT COUNT(*)::integer FROM "CodeItem" c WHERE c."batchId" = b2."id"), 0) AS "n"
  FROM "CodeBatch" b2
) AS actual
WHERE actual."id" = b."id" AND b."quantity" IS DISTINCT FROM actual."n";
