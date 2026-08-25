-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPPORT',
    "twoFactorSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "walletBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "allowedProductIds" TEXT NOT NULL DEFAULT '[]',
    "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false,
    "totalKeysGenerated" INTEGER NOT NULL DEFAULT 0,
    "lastKeyGeneratedAt" TIMESTAMP(3),
    "webhookSecret" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "idDocType" TEXT,
    "idFrontImage" TEXT,
    "idBackImage" TEXT,
    "businessNtn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantUser" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "twoFactorSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "ipWhitelist" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactInfo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "brandId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "symbol" TEXT NOT NULL DEFAULT '$',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRegion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "productRegionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "customerPrice" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentCombination" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentCombination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentCombinationItem" (
    "id" TEXT NOT NULL,
    "combinationId" TEXT NOT NULL,
    "denominationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FulfillmentCombinationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "productType" TEXT NOT NULL DEFAULT 'NORMAL',
    "categoryId" TEXT,
    "supplierId" TEXT,
    "merchantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EssentialsDeliveryItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "denominationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EssentialsDeliveryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Denomination" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "faceValue" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Denomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeItem" (
    "id" TEXT NOT NULL,
    "denominationId" TEXT NOT NULL,
    "encryptedCode" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "batchId" TEXT,
    "supplierId" TEXT,
    "merchantId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'DCV',
    "reservedUntil" TIMESTAMP(3),
    "reservedByReqId" TEXT,
    "revealedAt" TIMESTAMP(3),
    "revealedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentRequest" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "codeItemIds" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ALLOCATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryToken" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revealedAt" TIMESTAMP(3),
    "revealedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "referenceId" TEXT,
    "fulfillmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT,
    "ip" TEXT,
    "prevHash" TEXT,
    "entryHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "requestBodyHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "merchantId" TEXT,
    "merchantAppStatus" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantApplication" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeEmail" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "idDocType" TEXT,
    "idFrontImage" TEXT,
    "idBackImage" TEXT,
    "businessNtn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerResponse" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingWebhook" (
    "id" TEXT NOT NULL,
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
    "amount" DECIMAL(65,30),
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
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminWallet" (
    "id" TEXT NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminWalletTransaction" (
    "id" TEXT NOT NULL,
    "adminWalletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "referenceId" TEXT,
    "source" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminWalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingRequest" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "adminWalletId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "note" TEXT,
    "screenshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "senderName" TEXT,
    "body" TEXT,
    "image" TEXT,
    "fundingRequestId" TEXT,
    "readByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "readByMerchant" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CodeBatch" (
    "id" TEXT NOT NULL,
    "denominationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "supplierId" TEXT,
    "costPerCode" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedProduct" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "provider" TEXT,
    "platformProductId" TEXT,
    "platformSku" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "imageUrl" TEXT,
    "price" DECIMAL(65,30),
    "currency" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "inventorySource" TEXT DEFAULT 'DCV',
    "dcvProductId" TEXT,
    "dcvDenominationId" TEXT,
    "dcvVariantId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "merchantId" TEXT,
    "customerOrderId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeEventId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentType" TEXT NOT NULL,
    "description" TEXT,
    "metadata" TEXT,
    "refundAmount" DECIMAL(65,30),
    "refundReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrder" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT,
    "productId" TEXT NOT NULL,
    "denominationId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "fulfillmentId" TEXT,
    "revealToken" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_webhookSecret_key" ON "Merchant"("webhookSecret");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantUser_email_key" ON "MerchantUser"("email");

-- CreateIndex
CREATE INDEX "MerchantUser_merchantId_idx" ON "MerchantUser"("merchantId");

-- CreateIndex
CREATE INDEX "ApiKey_merchantId_idx" ON "ApiKey"("merchantId");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_brandId_idx" ON "Category"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE INDEX "ProductRegion_productId_idx" ON "ProductRegion"("productId");

-- CreateIndex
CREATE INDEX "ProductRegion_regionId_idx" ON "ProductRegion"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRegion_productId_regionId_key" ON "ProductRegion"("productId", "regionId");

-- CreateIndex
CREATE INDEX "Variant_productRegionId_idx" ON "Variant"("productRegionId");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_productRegionId_slug_key" ON "Variant"("productRegionId", "slug");

-- CreateIndex
CREATE INDEX "FulfillmentCombination_variantId_active_priority_idx" ON "FulfillmentCombination"("variantId", "active", "priority");

-- CreateIndex
CREATE INDEX "FulfillmentCombinationItem_combinationId_idx" ON "FulfillmentCombinationItem"("combinationId");

-- CreateIndex
CREATE INDEX "FulfillmentCombinationItem_denominationId_idx" ON "FulfillmentCombinationItem"("denominationId");

-- CreateIndex
CREATE INDEX "Product_merchantId_idx" ON "Product"("merchantId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "EssentialsDeliveryItem_productId_idx" ON "EssentialsDeliveryItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "EssentialsDeliveryItem_productId_denominationId_key" ON "EssentialsDeliveryItem"("productId", "denominationId");

-- CreateIndex
CREATE INDEX "Denomination_productId_idx" ON "Denomination"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Denomination_productId_faceValue_currency_key" ON "Denomination"("productId", "faceValue", "currency");

-- CreateIndex
CREATE INDEX "CodeItem_denominationId_status_idx" ON "CodeItem"("denominationId", "status");

-- CreateIndex
CREATE INDEX "CodeItem_status_idx" ON "CodeItem"("status");

-- CreateIndex
CREATE INDEX "CodeItem_codeHash_idx" ON "CodeItem"("codeHash");

-- CreateIndex
CREATE INDEX "CodeItem_batchId_idx" ON "CodeItem"("batchId");

-- CreateIndex
CREATE INDEX "CodeItem_merchantId_idx" ON "CodeItem"("merchantId");

-- CreateIndex
CREATE INDEX "CodeItem_denominationId_status_merchantId_idx" ON "CodeItem"("denominationId", "status", "merchantId");

-- CreateIndex
CREATE INDEX "FulfillmentRequest_merchantId_idx" ON "FulfillmentRequest"("merchantId");

-- CreateIndex
CREATE INDEX "FulfillmentRequest_status_idx" ON "FulfillmentRequest"("status");

-- CreateIndex
CREATE INDEX "FulfillmentRequest_productId_idx" ON "FulfillmentRequest"("productId");

-- CreateIndex
CREATE INDEX "FulfillmentRequest_customerEmail_idx" ON "FulfillmentRequest"("customerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentRequest_merchantId_idempotencyKey_key" ON "FulfillmentRequest"("merchantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Allocation_fulfillmentId_idx" ON "Allocation"("fulfillmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryToken_fulfillmentId_key" ON "DeliveryToken"("fulfillmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryToken_tokenHash_key" ON "DeliveryToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DeliveryToken_tokenHash_idx" ON "DeliveryToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_fulfillmentId_key" ON "WalletTransaction"("fulfillmentId");

-- CreateIndex
CREATE INDEX "WalletTransaction_merchantId_idx" ON "WalletTransaction"("merchantId");

-- CreateIndex
CREATE INDEX "WalletTransaction_referenceId_idx" ON "WalletTransaction"("referenceId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_merchantId_idx" ON "WebhookEndpoint"("merchantId");

-- CreateIndex
CREATE INDEX "AuditLog_actorType_actorId_idx" ON "AuditLog"("actorType", "actorId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_key_key" ON "IdempotencyRecord"("key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_merchantId_key_idx" ON "IdempotencyRecord"("merchantId", "key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_merchantId_idx" ON "Customer"("merchantId");

-- CreateIndex
CREATE INDEX "Customer_merchantAppStatus_idx" ON "Customer"("merchantAppStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantApplication_customerId_key" ON "MerchantApplication"("customerId");

-- CreateIndex
CREATE INDEX "MerchantApplication_status_idx" ON "MerchantApplication"("status");

-- CreateIndex
CREATE INDEX "MerchantApplication_createdAt_idx" ON "MerchantApplication"("createdAt");

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
CREATE INDEX "AdminWalletTransaction_adminWalletId_idx" ON "AdminWalletTransaction"("adminWalletId");

-- CreateIndex
CREATE INDEX "AdminWalletTransaction_referenceId_idx" ON "AdminWalletTransaction"("referenceId");

-- CreateIndex
CREATE INDEX "AdminWalletTransaction_source_idx" ON "AdminWalletTransaction"("source");

-- CreateIndex
CREATE INDEX "AdminWalletTransaction_createdAt_idx" ON "AdminWalletTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "FundingRequest_merchantId_idx" ON "FundingRequest"("merchantId");

-- CreateIndex
CREATE INDEX "FundingRequest_adminWalletId_idx" ON "FundingRequest"("adminWalletId");

-- CreateIndex
CREATE INDEX "FundingRequest_status_idx" ON "FundingRequest"("status");

-- CreateIndex
CREATE INDEX "FundingRequest_createdAt_idx" ON "FundingRequest"("createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_merchantId_createdAt_idx" ON "SupportMessage"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_readByAdmin_idx" ON "SupportMessage"("readByAdmin");

-- CreateIndex
CREATE INDEX "CodeBatch_denominationId_idx" ON "CodeBatch"("denominationId");

-- CreateIndex
CREATE INDEX "CodeBatch_createdAt_idx" ON "CodeBatch"("createdAt");

-- CreateIndex
CREATE INDEX "ConnectedProduct_merchantId_idx" ON "ConnectedProduct"("merchantId");

-- CreateIndex
CREATE INDEX "ConnectedProduct_platform_idx" ON "ConnectedProduct"("platform");

-- CreateIndex
CREATE INDEX "ConnectedProduct_status_idx" ON "ConnectedProduct"("status");

-- CreateIndex
CREATE INDEX "ConnectedProduct_dcvProductId_idx" ON "ConnectedProduct"("dcvProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedProduct_merchantId_platform_platformProductId_key" ON "ConnectedProduct"("merchantId", "platform", "platformProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedProduct_merchantId_platform_platformSku_key" ON "ConnectedProduct"("merchantId", "platform", "platformSku");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_customerOrderId_key" ON "PaymentRecord"("customerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_stripeCheckoutSessionId_key" ON "PaymentRecord"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_stripePaymentIntentId_key" ON "PaymentRecord"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_stripeEventId_key" ON "PaymentRecord"("stripeEventId");

-- CreateIndex
CREATE INDEX "PaymentRecord_merchantId_idx" ON "PaymentRecord"("merchantId");

-- CreateIndex
CREATE INDEX "PaymentRecord_customerId_idx" ON "PaymentRecord"("customerId");

-- CreateIndex
CREATE INDEX "PaymentRecord_status_idx" ON "PaymentRecord"("status");

-- CreateIndex
CREATE INDEX "PaymentRecord_paymentType_idx" ON "PaymentRecord"("paymentType");

-- CreateIndex
CREATE INDEX "PaymentRecord_createdAt_idx" ON "PaymentRecord"("createdAt");

-- CreateIndex
CREATE INDEX "CustomerOrder_customerId_idx" ON "CustomerOrder"("customerId");

-- CreateIndex
CREATE INDEX "CustomerOrder_customerEmail_idx" ON "CustomerOrder"("customerEmail");

-- CreateIndex
CREATE INDEX "CustomerOrder_status_idx" ON "CustomerOrder"("status");

-- CreateIndex
CREATE INDEX "CustomerOrder_productId_idx" ON "CustomerOrder"("productId");

-- CreateIndex
CREATE INDEX "CustomerOrder_createdAt_idx" ON "CustomerOrder"("createdAt");

-- AddForeignKey
ALTER TABLE "MerchantUser" ADD CONSTRAINT "MerchantUser_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRegion" ADD CONSTRAINT "ProductRegion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRegion" ADD CONSTRAINT "ProductRegion_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productRegionId_fkey" FOREIGN KEY ("productRegionId") REFERENCES "ProductRegion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentCombination" ADD CONSTRAINT "FulfillmentCombination_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentCombinationItem" ADD CONSTRAINT "FulfillmentCombinationItem_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "FulfillmentCombination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentCombinationItem" ADD CONSTRAINT "FulfillmentCombinationItem_denominationId_fkey" FOREIGN KEY ("denominationId") REFERENCES "Denomination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EssentialsDeliveryItem" ADD CONSTRAINT "EssentialsDeliveryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EssentialsDeliveryItem" ADD CONSTRAINT "EssentialsDeliveryItem_denominationId_fkey" FOREIGN KEY ("denominationId") REFERENCES "Denomination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Denomination" ADD CONSTRAINT "Denomination_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeItem" ADD CONSTRAINT "CodeItem_denominationId_fkey" FOREIGN KEY ("denominationId") REFERENCES "Denomination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeItem" ADD CONSTRAINT "CodeItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeItem" ADD CONSTRAINT "CodeItem_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentRequest" ADD CONSTRAINT "FulfillmentRequest_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentRequest" ADD CONSTRAINT "FulfillmentRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "FulfillmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryToken" ADD CONSTRAINT "DeliveryToken_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "FulfillmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "FulfillmentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantApplication" ADD CONSTRAINT "MerchantApplication_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationCode" ADD CONSTRAINT "VerificationCode_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminWalletTransaction" ADD CONSTRAINT "AdminWalletTransaction_adminWalletId_fkey" FOREIGN KEY ("adminWalletId") REFERENCES "AdminWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingRequest" ADD CONSTRAINT "FundingRequest_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingRequest" ADD CONSTRAINT "FundingRequest_adminWalletId_fkey" FOREIGN KEY ("adminWalletId") REFERENCES "AdminWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeBatch" ADD CONSTRAINT "CodeBatch_denominationId_fkey" FOREIGN KEY ("denominationId") REFERENCES "Denomination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeBatch" ADD CONSTRAINT "CodeBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedProduct" ADD CONSTRAINT "ConnectedProduct_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedProduct" ADD CONSTRAINT "ConnectedProduct_dcvProductId_fkey" FOREIGN KEY ("dcvProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_customerOrderId_fkey" FOREIGN KEY ("customerOrderId") REFERENCES "CustomerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

