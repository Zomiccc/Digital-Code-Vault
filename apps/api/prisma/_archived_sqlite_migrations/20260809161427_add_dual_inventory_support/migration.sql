/*
  Warnings:

  - You are about to drop the column `expiresAt` on the `DeliveryToken` table. All the data in the column will be lost.
  - You are about to alter the column `faceValue` on the `Denomination` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `amount` on the `FulfillmentRequest` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `walletBalance` on the `Merchant` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `amount` on the `WalletTransaction` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `balanceAfter` on the `WalletTransaction` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.

*/
-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "entryHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "prevHash" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "merchantId" TEXT,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VerificationCode_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerResponse" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IncomingWebhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "merchantId" TEXT,
    "platform" TEXT NOT NULL,
    "provider" TEXT,
    "orderId" TEXT,
    "productId" TEXT,
    "productName" TEXT,
    "productSku" TEXT,
    "productCategory" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "quantity" INTEGER,
    "amount" DECIMAL,
    "currency" TEXT,
    "paymentStatus" TEXT,
    "orderStatus" TEXT,
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "rawPayload" TEXT NOT NULL,
    "rawHeaders" TEXT,
    "signature" TEXT,
    "sourceIp" TEXT,
    "responseCode" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ConnectedProduct" (
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
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConnectedProduct_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "ipWhitelist" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "ApiKey_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ApiKey" ("createdAt", "id", "keyHash", "keyPrefix", "lastUsedAt", "merchantId", "revokedAt", "scopes", "status") SELECT "createdAt", "id", "keyHash", "keyPrefix", "lastUsedAt", "merchantId", "revokedAt", "scopes", "status" FROM "ApiKey";
DROP TABLE "ApiKey";
ALTER TABLE "new_ApiKey" RENAME TO "ApiKey";
CREATE INDEX "ApiKey_merchantId_idx" ON "ApiKey"("merchantId");
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");
CREATE TABLE "new_CodeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "denominationId" TEXT NOT NULL,
    "encryptedCode" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "batchId" TEXT,
    "supplierId" TEXT,
    "merchantId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'DCV',
    "reservedUntil" DATETIME,
    "reservedByReqId" TEXT,
    "revealedAt" DATETIME,
    "revealedIp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CodeItem_denominationId_fkey" FOREIGN KEY ("denominationId") REFERENCES "Denomination" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CodeItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CodeItem_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CodeItem" ("batchId", "codeHash", "createdAt", "denominationId", "encryptedCode", "id", "reservedByReqId", "reservedUntil", "revealedAt", "revealedIp", "status", "supplierId", "updatedAt") SELECT "batchId", "codeHash", "createdAt", "denominationId", "encryptedCode", "id", "reservedByReqId", "reservedUntil", "revealedAt", "revealedIp", "status", "supplierId", "updatedAt" FROM "CodeItem";
DROP TABLE "CodeItem";
ALTER TABLE "new_CodeItem" RENAME TO "CodeItem";
CREATE INDEX "CodeItem_denominationId_status_idx" ON "CodeItem"("denominationId", "status");
CREATE INDEX "CodeItem_status_idx" ON "CodeItem"("status");
CREATE INDEX "CodeItem_codeHash_idx" ON "CodeItem"("codeHash");
CREATE INDEX "CodeItem_batchId_idx" ON "CodeItem"("batchId");
CREATE INDEX "CodeItem_merchantId_idx" ON "CodeItem"("merchantId");
CREATE INDEX "CodeItem_denominationId_status_merchantId_idx" ON "CodeItem"("denominationId", "status", "merchantId");
CREATE TABLE "new_DeliveryToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fulfillmentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revealedAt" DATETIME,
    "revealedIp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryToken_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "FulfillmentRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DeliveryToken" ("createdAt", "fulfillmentId", "id", "revealedAt", "revealedIp", "tokenHash") SELECT "createdAt", "fulfillmentId", "id", "revealedAt", "revealedIp", "tokenHash" FROM "DeliveryToken";
DROP TABLE "DeliveryToken";
ALTER TABLE "new_DeliveryToken" RENAME TO "DeliveryToken";
CREATE UNIQUE INDEX "DeliveryToken_fulfillmentId_key" ON "DeliveryToken"("fulfillmentId");
CREATE UNIQUE INDEX "DeliveryToken_tokenHash_key" ON "DeliveryToken"("tokenHash");
CREATE INDEX "DeliveryToken_tokenHash_idx" ON "DeliveryToken"("tokenHash");
CREATE TABLE "new_Denomination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "faceValue" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Denomination_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Denomination" ("createdAt", "currency", "faceValue", "id", "productId") SELECT "createdAt", "currency", "faceValue", "id", "productId" FROM "Denomination";
DROP TABLE "Denomination";
ALTER TABLE "new_Denomination" RENAME TO "Denomination";
CREATE INDEX "Denomination_productId_idx" ON "Denomination"("productId");
CREATE UNIQUE INDEX "Denomination_productId_faceValue_currency_key" ON "Denomination"("productId", "faceValue", "currency");
CREATE TABLE "new_FulfillmentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT NOT NULL,
    "referenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "customerAddress" TEXT,
    "inventorySource" TEXT DEFAULT 'DCV',
    "walletCharged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FulfillmentRequest_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FulfillmentRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FulfillmentRequest" ("amount", "createdAt", "currency", "failureReason", "id", "idempotencyKey", "merchantId", "productId", "referenceId", "sandbox", "status", "updatedAt") SELECT "amount", "createdAt", "currency", "failureReason", "id", "idempotencyKey", "merchantId", "productId", "referenceId", "sandbox", "status", "updatedAt" FROM "FulfillmentRequest";
DROP TABLE "FulfillmentRequest";
ALTER TABLE "new_FulfillmentRequest" RENAME TO "FulfillmentRequest";
CREATE INDEX "FulfillmentRequest_merchantId_idx" ON "FulfillmentRequest"("merchantId");
CREATE INDEX "FulfillmentRequest_status_idx" ON "FulfillmentRequest"("status");
CREATE INDEX "FulfillmentRequest_productId_idx" ON "FulfillmentRequest"("productId");
CREATE INDEX "FulfillmentRequest_customerEmail_idx" ON "FulfillmentRequest"("customerEmail");
CREATE UNIQUE INDEX "FulfillmentRequest_merchantId_idempotencyKey_key" ON "FulfillmentRequest"("merchantId", "idempotencyKey");
CREATE TABLE "new_Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "walletBalance" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "allowedProductIds" TEXT NOT NULL DEFAULT '[]',
    "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false,
    "totalKeysGenerated" INTEGER NOT NULL DEFAULT 0,
    "lastKeyGeneratedAt" DATETIME,
    "webhookSecret" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Merchant" ("allowedProductIds", "createdAt", "currency", "email", "id", "name", "status", "twoFactorRequired", "updatedAt", "walletBalance") SELECT "allowedProductIds", "createdAt", "currency", "email", "id", "name", "status", "twoFactorRequired", "updatedAt", "walletBalance" FROM "Merchant";
DROP TABLE "Merchant";
ALTER TABLE "new_Merchant" RENAME TO "Merchant";
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");
CREATE UNIQUE INDEX "Merchant_webhookSecret_key" ON "Merchant"("webhookSecret");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "supplierId" TEXT,
    "merchantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("createdAt", "id", "name", "region", "status", "supplierId", "updatedAt") SELECT "createdAt", "id", "name", "region", "status", "supplierId", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_merchantId_idx" ON "Product"("merchantId");
CREATE TABLE "new_WalletTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "balanceAfter" DECIMAL NOT NULL,
    "referenceId" TEXT,
    "fulfillmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletTransaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WalletTransaction_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "FulfillmentRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WalletTransaction" ("amount", "balanceAfter", "createdAt", "fulfillmentId", "id", "merchantId", "referenceId", "type") SELECT "amount", "balanceAfter", "createdAt", "fulfillmentId", "id", "merchantId", "referenceId", "type" FROM "WalletTransaction";
DROP TABLE "WalletTransaction";
ALTER TABLE "new_WalletTransaction" RENAME TO "WalletTransaction";
CREATE UNIQUE INDEX "WalletTransaction_fulfillmentId_key" ON "WalletTransaction"("fulfillmentId");
CREATE INDEX "WalletTransaction_merchantId_idx" ON "WalletTransaction"("merchantId");
CREATE INDEX "WalletTransaction_referenceId_idx" ON "WalletTransaction"("referenceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_merchantId_idx" ON "Customer"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationCode_customerId_key" ON "VerificationCode"("customerId");

-- CreateIndex
CREATE INDEX "VerificationCode_customerId_idx" ON "VerificationCode"("customerId");

-- CreateIndex
CREATE INDEX "EmailLog_merchantId_idx" ON "EmailLog"("merchantId");

-- CreateIndex
CREATE INDEX "EmailLog_recipient_idx" ON "EmailLog"("recipient");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingWebhook_eventId_key" ON "IncomingWebhook"("eventId");

-- CreateIndex
CREATE INDEX "IncomingWebhook_eventId_idx" ON "IncomingWebhook"("eventId");

-- CreateIndex
CREATE INDEX "IncomingWebhook_merchantId_idx" ON "IncomingWebhook"("merchantId");

-- CreateIndex
CREATE INDEX "IncomingWebhook_platform_idx" ON "IncomingWebhook"("platform");

-- CreateIndex
CREATE INDEX "IncomingWebhook_processingStatus_idx" ON "IncomingWebhook"("processingStatus");

-- CreateIndex
CREATE INDEX "IncomingWebhook_orderId_idx" ON "IncomingWebhook"("orderId");

-- CreateIndex
CREATE INDEX "IncomingWebhook_productId_idx" ON "IncomingWebhook"("productId");

-- CreateIndex
CREATE INDEX "IncomingWebhook_customerEmail_idx" ON "IncomingWebhook"("customerEmail");

-- CreateIndex
CREATE INDEX "IncomingWebhook_createdAt_idx" ON "IncomingWebhook"("createdAt");

-- CreateIndex
CREATE INDEX "ConnectedProduct_merchantId_idx" ON "ConnectedProduct"("merchantId");

-- CreateIndex
CREATE INDEX "ConnectedProduct_platform_idx" ON "ConnectedProduct"("platform");

-- CreateIndex
CREATE INDEX "ConnectedProduct_status_idx" ON "ConnectedProduct"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedProduct_merchantId_platform_platformProductId_key" ON "ConnectedProduct"("merchantId", "platform", "platformProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedProduct_merchantId_platform_platformSku_key" ON "ConnectedProduct"("merchantId", "platform", "platformSku");
