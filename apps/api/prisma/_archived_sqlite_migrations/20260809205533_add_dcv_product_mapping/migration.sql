-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ConnectedProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "provider" TEXT,
    "platformProductId" TEXT,
    "platformSku" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "imageUrl" TEXT,
    "price" DECIMAL,
    "currency" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "inventorySource" TEXT DEFAULT 'DCV',
    "dcvProductId" TEXT,
    "dcvDenominationId" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConnectedProduct_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConnectedProduct_dcvProductId_fkey" FOREIGN KEY ("dcvProductId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ConnectedProduct" ("category", "createdAt", "currency", "id", "imageUrl", "inventorySource", "lastSyncedAt", "merchantId", "name", "platform", "platformProductId", "platformSku", "price", "provider", "sku", "status", "stock", "updatedAt") SELECT "category", "createdAt", "currency", "id", "imageUrl", "inventorySource", "lastSyncedAt", "merchantId", "name", "platform", "platformProductId", "platformSku", "price", "provider", "sku", "status", "stock", "updatedAt" FROM "ConnectedProduct";
DROP TABLE "ConnectedProduct";
ALTER TABLE "new_ConnectedProduct" RENAME TO "ConnectedProduct";
CREATE INDEX "ConnectedProduct_merchantId_idx" ON "ConnectedProduct"("merchantId");
CREATE INDEX "ConnectedProduct_platform_idx" ON "ConnectedProduct"("platform");
CREATE INDEX "ConnectedProduct_status_idx" ON "ConnectedProduct"("status");
CREATE INDEX "ConnectedProduct_dcvProductId_idx" ON "ConnectedProduct"("dcvProductId");
CREATE UNIQUE INDEX "ConnectedProduct_merchantId_platform_platformProductId_key" ON "ConnectedProduct"("merchantId", "platform", "platformProductId");
CREATE UNIQUE INDEX "ConnectedProduct_merchantId_platform_platformSku_key" ON "ConnectedProduct"("merchantId", "platform", "platformSku");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
