"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantDashboardController = void 0;
const common_1 = require("@nestjs/common");
const merchants_service_1 = require("./merchants.service");
const support_service_1 = require("./support.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const plugin_download_service_1 = require("./plugin-download.service");
const webhook_service_1 = require("../webhooks/webhook.service");
const fulfillment_service_1 = require("../fulfillment/fulfillment.service");
const wallet_service_1 = require("../wallet/wallet.service");
const codes_service_1 = require("../codes/codes.service");
const products_service_1 = require("../products/products.service");
const nanoid_1 = require("nanoid");
const dto_1 = require("../dto");
let MerchantDashboardController = class MerchantDashboardController {
    merchantsService;
    supportService;
    webhookService;
    fulfillmentService;
    codesService;
    productsService;
    walletService;
    pluginDownloadService;
    constructor(merchantsService, supportService, webhookService, fulfillmentService, codesService, productsService, walletService, pluginDownloadService) {
        this.merchantsService = merchantsService;
        this.supportService = supportService;
        this.webhookService = webhookService;
        this.fulfillmentService = fulfillmentService;
        this.codesService = codesService;
        this.productsService = productsService;
        this.walletService = walletService;
        this.pluginDownloadService = pluginDownloadService;
    }
    async getWallet(req) {
        return this.merchantsService.getWallet(req.user.merchantId);
    }
    async listMyFundingRequests(req) {
        return this.walletService.listFundingRequests(req.user.merchantId);
    }
    async createFundingRequest(body, req) {
        const request = await this.walletService.createFundingRequest(req.user.merchantId, body.amount, body.note, body.screenshot);
        await this.supportService.sendMerchantMessage(req.user.merchantId, req.user.name || req.user.email, body.note || `I sent $${body.amount} via EasyPaisa/bank transfer — please verify and approve.`, body.screenshot, request.id).catch(() => { });
        return request;
    }
    async getPaymentDetails(req) {
        return this.merchantsService.getAdminPaymentDetails();
    }
    async getSupportThread(req) {
        return this.supportService.getMerchantThread(req.user.merchantId);
    }
    async sendSupportMessage(body, req) {
        if (!body.body && !body.image) {
            throw new common_1.BadRequestException('Message text or an image is required');
        }
        await this.supportService.sendMerchantMessage(req.user.merchantId, req.user.name || req.user.email, body.body, body.image, body.fundingRequestId);
        return { success: true };
    }
    async listOrders(req, limit, offset) {
        return this.merchantsService.listFulfillmentRequests(req.user.merchantId, limit ? parseInt(limit) : 50, offset ? parseInt(offset) : 0);
    }
    async listApiKeys(req) {
        return this.merchantsService.listApiKeys(req.user.merchantId);
    }
    async createApiKey(body, req) {
        return this.merchantsService.createApiKey(req.user.merchantId, body.scopes);
    }
    async createDashboardFulfillment(body, req) {
        if (!body.product_id || !body.amount) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_FIELDS',
                message: 'product_id and amount are required',
            });
        }
        const idempotencyKey = `dashboard-${(0, nanoid_1.nanoid)(16)}`;
        return this.fulfillmentService.createFulfillment({
            merchantId: req.user.merchantId,
            productId: body.product_id,
            amount: body.amount,
            currency: body.currency || 'USD',
            referenceId: body.reference_id,
            idempotencyKey,
            customerEmail: body.customer_email,
            customerName: body.customer_name,
            actorType: 'MERCHANT',
            actorId: req.user.id,
            ip: req.ip,
            inventorySource: body.inventory_source,
            variantId: body.variant_id,
        });
    }
    async listWebhooks(req) {
        return this.webhookService.listEndpoints(req.user.merchantId);
    }
    async createWebhook(body, req) {
        if (!body.url) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_URL',
                message: 'url is required',
            });
        }
        return this.webhookService.registerEndpoint(req.user.merchantId, body.url, body.skipVerification || false);
    }
    async deleteWebhook(id, req) {
        return this.webhookService.deleteEndpoint(req.user.merchantId, id);
    }
    async getWebhookSecret(req) {
        return this.merchantsService.getWebhookSecret(req.user.merchantId);
    }
    async regenerateWebhookSecret(req) {
        return this.merchantsService.regenerateWebhookSecret(req.user.merchantId);
    }
    async listInventory(req, denominationId, status, limit, offset) {
        return this.codesService.listMerchantCodes(req.user.merchantId, {
            denominationId,
            status,
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0,
        });
    }
    async getInventoryStats(req) {
        return this.codesService.getMerchantInventoryStats(req.user.merchantId);
    }
    async uploadCodes(body, req) {
        if (!body.denomination_id || !body.codes || !Array.isArray(body.codes)) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_FIELDS',
                message: 'denomination_id and codes array are required',
            });
        }
        return this.codesService.merchantBulkUpload(body.denomination_id, body.codes, req.user.merchantId, req.ip);
    }
    async voidCode(id, req) {
        return this.codesService.voidMerchantCode(id, req.user.merchantId, req.ip);
    }
    async listProducts(req) {
        return this.productsService.listProductsForMerchant(req.user.merchantId);
    }
    async downloadWordPressPlugin(res) {
        return this.pluginDownloadService.downloadPlugin(res);
    }
};
exports.MerchantDashboardController = MerchantDashboardController;
__decorate([
    (0, common_1.Get)('dashboard/wallet'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "getWallet", null);
__decorate([
    (0, common_1.Get)('dashboard/funding-requests'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "listMyFundingRequests", null);
__decorate([
    (0, common_1.Post)('dashboard/funding-requests'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateFundingRequestDto, Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "createFundingRequest", null);
__decorate([
    (0, common_1.Get)('dashboard/payment-details'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "getPaymentDetails", null);
__decorate([
    (0, common_1.Get)('support/messages'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "getSupportThread", null);
__decorate([
    (0, common_1.Post)('support/messages'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateSupportMessageDto, Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "sendSupportMessage", null);
__decorate([
    (0, common_1.Get)('dashboard/orders'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "listOrders", null);
__decorate([
    (0, common_1.Get)('dashboard/api-keys'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "listApiKeys", null);
__decorate([
    (0, common_1.Post)('dashboard/api-keys'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateApiKeyDto, Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "createApiKey", null);
__decorate([
    (0, common_1.Post)('dashboard/fulfillment'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateFulfillmentDto, Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "createDashboardFulfillment", null);
__decorate([
    (0, common_1.Get)('webhooks'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "listWebhooks", null);
__decorate([
    (0, common_1.Post)('webhooks'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateWebhookDto, Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "createWebhook", null);
__decorate([
    (0, common_1.Delete)('webhooks/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "deleteWebhook", null);
__decorate([
    (0, common_1.Get)('webhook-secret'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "getWebhookSecret", null);
__decorate([
    (0, common_1.Post)('webhook-secret/regenerate'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "regenerateWebhookSecret", null);
__decorate([
    (0, common_1.Get)('dashboard/inventory'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('denominationId')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('limit')),
    __param(4, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "listInventory", null);
__decorate([
    (0, common_1.Get)('dashboard/inventory/stats'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "getInventoryStats", null);
__decorate([
    (0, common_1.Post)('dashboard/inventory/upload'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "uploadCodes", null);
__decorate([
    (0, common_1.Post)('dashboard/inventory/:id/void'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "voidCode", null);
__decorate([
    (0, common_1.Get)('dashboard/products'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "listProducts", null);
__decorate([
    (0, common_1.Get)('integrations/wordpress/plugin/download'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantDashboardController.prototype, "downloadWordPressPlugin", null);
exports.MerchantDashboardController = MerchantDashboardController = __decorate([
    (0, common_1.Controller)('merchant'),
    __metadata("design:paramtypes", [merchants_service_1.MerchantsService,
        support_service_1.SupportService,
        webhook_service_1.WebhookService,
        fulfillment_service_1.FulfillmentService,
        codes_service_1.CodesService,
        products_service_1.ProductsService,
        wallet_service_1.WalletService,
        plugin_download_service_1.PluginDownloadService])
], MerchantDashboardController);
//# sourceMappingURL=merchant-dashboard.controller.js.map