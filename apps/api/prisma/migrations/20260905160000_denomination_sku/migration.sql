-- Sub-product SKU, e.g. PSN-USA-10.
ALTER TABLE "Denomination" ADD COLUMN IF NOT EXISTS "sku" TEXT;
CREATE INDEX IF NOT EXISTS "Denomination_sku_idx" ON "Denomination" ("sku");
