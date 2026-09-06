-- A merchant holds one balance per currency instead of a single switchable wallet.
CREATE TABLE IF NOT EXISTS "MerchantWallet" (
  "id"         TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "currency"   TEXT NOT NULL,
  "balance"    DECIMAL(65,30) NOT NULL DEFAULT 0,
  "spendOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MerchantWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MerchantWallet_merchantId_currency_key"
  ON "MerchantWallet" ("merchantId", "currency");
CREATE INDEX IF NOT EXISTS "MerchantWallet_merchantId_spendOrder_idx"
  ON "MerchantWallet" ("merchantId", "spendOrder");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'MerchantWallet_merchantId_fkey'
  ) THEN
    ALTER TABLE "MerchantWallet"
      ADD CONSTRAINT "MerchantWallet_merchantId_fkey"
      FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Carry each merchant's existing balance into a wallet of the currency it is
-- already held in. Nothing is converted, so no balance changes value.
INSERT INTO "MerchantWallet" ("id", "merchantId", "currency", "balance", "spendOrder", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  m."id",
  UPPER(COALESCE(m."currency", 'USD')),
  m."walletBalance",
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Merchant" m
ON CONFLICT ("merchantId", "currency") DO NOTHING;

-- Every merchant also gets a USD wallet, so both are available to deposit into
-- without needing a settings change first.
INSERT INTO "MerchantWallet" ("id", "merchantId", "currency", "balance", "spendOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, m."id", 'USD', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Merchant" m
ON CONFLICT ("merchantId", "currency") DO NOTHING;
