-- Admin-managed conversion rates against USD. USD is the implicit base and is never stored.
CREATE TABLE "ExchangeRate" (
  "currency"    TEXT NOT NULL,
  "unitsPerUsd" DECIMAL(65,30) NOT NULL,
  "updatedBy"   TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("currency")
);

-- Carry over the single USD->PKR rate the platform already used, so no rate is lost.
INSERT INTO "ExchangeRate" ("currency", "unitsPerUsd", "updatedAt")
SELECT 'PKR', "value"::decimal, CURRENT_TIMESTAMP
FROM "PlatformSetting"
WHERE "key" = 'USD_TO_PKR_RATE' AND "value" ~ '^[0-9]+(\.[0-9]+)?$'
ON CONFLICT ("currency") DO NOTHING;

-- Wallet rows are denominated in the merchant's own wallet currency.
ALTER TABLE "WalletTransaction" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

-- Record what the wallet was actually charged and the rate used at order time.
ALTER TABLE "FulfillmentRequest" ADD COLUMN "chargedCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "FulfillmentRequest" ADD COLUMN "chargedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "FulfillmentRequest" ADD COLUMN "fxRate" DECIMAL(65,30) NOT NULL DEFAULT 1;

-- Existing orders were all charged in USD at parity; backfill so history reconciles.
UPDATE "FulfillmentRequest" SET "chargedAmount" = "amount" WHERE "walletCharged" = true;

-- Existing wallet rows inherit their merchant's wallet currency.
UPDATE "WalletTransaction" w
SET "currency" = COALESCE(m."currency", 'USD')
FROM "Merchant" m
WHERE m."id" = w."merchantId";
