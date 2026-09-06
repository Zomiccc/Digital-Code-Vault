-- Selling prices set explicitly per currency, separate from batch cost.
CREATE TABLE IF NOT EXISTS "SellingPrice" (
  "id"        TEXT NOT NULL,
  "itemType"  TEXT NOT NULL,
  "itemId"    TEXT NOT NULL,
  "currency"  TEXT NOT NULL,
  "amount"    DECIMAL(65,30) NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellingPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SellingPrice_itemType_itemId_currency_key"
  ON "SellingPrice" ("itemType", "itemId", "currency");
CREATE INDEX IF NOT EXISTS "SellingPrice_itemId_idx" ON "SellingPrice" ("itemId");

-- Seed each item's existing price as its price in the currency it is already
-- stated in, so nothing changes value and only the missing currency is left to set.
INSERT INTO "SellingPrice" ("id", "itemType", "itemId", "currency", "amount", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'DENOMINATION', d."id", UPPER(COALESCE(d."currency", 'USD')),
       d."faceValue", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Denomination" d
ON CONFLICT ("itemType", "itemId", "currency") DO NOTHING;

INSERT INTO "SellingPrice" ("id", "itemType", "itemId", "currency", "amount", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'VARIANT', v."id", UPPER(COALESCE(v."currency", 'USD')),
       v."customerPrice", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Variant" v
ON CONFLICT ("itemType", "itemId", "currency") DO NOTHING;
