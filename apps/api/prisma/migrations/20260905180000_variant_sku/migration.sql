-- Variant SKU, e.g. PSN-KSA-ESS-1M.
ALTER TABLE "Variant" ADD COLUMN IF NOT EXISTS "sku" TEXT;
CREATE INDEX IF NOT EXISTS "Variant_sku_idx" ON "Variant" ("sku");
