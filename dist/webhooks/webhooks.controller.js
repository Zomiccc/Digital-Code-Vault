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
exports.WebhooksController = void 0;
const common_1 = require("@nestjs/common");
const webhook_service_1 = require("./webhook.service");
const api_key_guard_1 = require("../auth/guards/api-key.guard");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const scopes_decorator_1 = require("../auth/decorators/scopes.decorator");
let WebhooksController = class WebhooksController {
    webhookService;
    constructor(webhookService) {
        this.webhookService = webhookService;
    }
    async listEndpoints(req) {
        return this.webhookService.listEndpoints(req.merchantId);
    }
    async registerEndpoint(body, req) {
        if (!body.url) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_URL',
                message: 'url is required',
            });
        }
        return this.webhookService.registerEndpoint(req.merchantId, body.url, body.skipVerification || false);
    }
    async deleteEndpoint(id, req) {
        return this.webhookService.deleteEndpoint(req.merchantId, id);
    }
    async receiveIncomingWebhook(payload, headers, req) {
        return this.webhookService.processIncomingWebhook(payload, headers, req.ip);
    }
    async listIncomingWebhooks(req) {
        return this.webhookService.listIncomingWebhooks(req.user.merchantId);
    }
    async retryIncomingWebhook(id, req) {
        return this.webhookService.retryIncomingWebhook(id, req.user.merchantId);
    }
    async listConnectedProducts(req) {
        return this.webhookService.listConnectedProducts(req.user.merchantId);
    }
    async updateConnectedProduct(id, body, req) {
        return this.webhookService.updateConnectedProductMapping(id, req.user.merchantId, body.dcv_product_id, body.dcv_denomination_id, body.inventory_source, body.dcv_variant_id);
    }
    async getWebhookStatistics(req) {
        return this.webhookService.getWebhookStatistics(req.user.merchantId);
    }
};
exports.WebhooksController = WebhooksController;
__decorate([
    (0, common_1.Get)('endpoints'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, scopes_decorator_1.Scopes)('read'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "listEndpoints", null);
__decorate([
    (0, common_1.Post)('endpoints'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, scopes_decorator_1.Scopes)('fulfillment'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "registerEndpoint", null);
__decorate([
    (0, common_1.Delete)('endpoints/:id'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, scopes_decorator_1.Scopes)('fulfillment'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "deleteEndpoint", null);
__decorate([
    (0, common_1.Post)('incoming'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "receiveIncomingWebhook", null);
__decorate([
    (0, common_1.Get)('incoming'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "listIncomingWebhooks", null);
__decorate([
    (0, common_1.Post)('incoming/:id/retry'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "retryIncomingWebhook", null);
__decorate([
    (0, common_1.Get)('connected-products'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "listConnectedProducts", null);
__decorate([
    (0, common_1.Put)('connected-products/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "updateConnectedProduct", null);
__decorate([
    (0, common_1.Get)('statistics'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "getWebhookStatistics", null);
exports.WebhooksController = WebhooksController = __decorate([
    (0, common_1.Controller)('webhooks'),
    __metadata("design:paramtypes", [webhook_service_1.WebhookService])
], WebhooksController);
//# sourceMappingURL=webhooks.controller.js.map