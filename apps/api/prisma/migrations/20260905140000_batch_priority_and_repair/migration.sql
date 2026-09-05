-- Batch allocation priority: the lowest number is consumed first within a denomination.
ALTER TABLE "CodeBatch" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "CodeBatch_denominationId_priority_idx"
  ON "CodeBatch" ("denominationId", "priority");

-- Schema repair. The production database was missing CodeBatch.batchName even
-- though its migration is recorded, which broke every code upload and silently
-- lost batch names before that. Anything already present is left untouched, so
-- this is safe to re-run and safe on a database that never drifted.
ALTER TABLE "CodeBatch"         ADD COLUMN IF NOT EXISTS "batchName"       TEXT;
ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "discountAmount"  DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "chargedCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "chargedAmount"   DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "FulfillmentRequest" ADD COLUMN IF NOT EXISTS "fxRate"          DECIMAL(65,30) NOT NULL DEFAULT 1;
ALTER TABLE "WalletTransaction"  ADD COLUMN IF NOT EXISTS "currency"        TEXT NOT NULL DEFAULT 'USD';

CREATE TABLE IF NOT EXISTS "ExchangeRate" (
  "currency"    TEXT NOT NULL,
  "unitsPerUsd" DECIMAL(65,30) NOT NULL,
  "updatedBy"   TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("currency")
);
