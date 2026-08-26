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
exports.MerchantApiController = exports.WalletController = void 0;
const common_1 = require("@nestjs/common");
const merchants_service_1 = require("./merchants.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
let WalletController = class WalletController {
    merchantsService;
    constructor(merchantsService) {
        this.merchantsService = merchantsService;
    }
    async getWallet(req) {
        return this.merchantsService.getWallet(req.user.merchantId);
    }
};
exports.WalletController = WalletController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "getWallet", null);
exports.WalletController = WalletController = __decorate([
    (0, common_1.Controller)('wallet'),
    __metadata("design:paramtypes", [merchants_service_1.MerchantsService])
], WalletController);
let MerchantApiController = class MerchantApiController {
    merchantsService;
    constructor(merchantsService) {
        this.merchantsService = merchantsService;
    }
    async listApiKeys(req) {
        return this.merchantsService.listApiKeys(req.user.merchantId);
    }
    async createApiKey(body, req) {
        return this.merchantsService.createApiKey(req.user.merchantId, body.scopes);
    }
    async revokeApiKey(id, req) {
        return this.merchantsService.revokeApiKey(req.user.merchantId, id);
    }
    async listOrders(req, limit, offset) {
        return this.merchantsService.listFulfillmentRequests(req.user.merchantId, limit ? parseInt(limit) : 50, offset ? parseInt(offset) : 0);
    }
};
exports.MerchantApiController = MerchantApiController;
__decorate([
    (0, common_1.Get)('api-keys'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MerchantApiController.prototype, "listApiKeys", null);
__decorate([
    (0, common_1.Post)('api-keys'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MerchantApiController.prototype, "createApiKey", null);
__decorate([
    (0, common_1.Delete)('api-keys/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MerchantApiController.prototype, "revokeApiKey", null);
__decorate([
    (0, common_1.Get)('orders'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], MerchantApiController.prototype, "listOrders", null);
exports.MerchantApiController = MerchantApiController = __decorate([
    (0, common_1.Controller)('merchant'),
    __metadata("design:paramtypes", [merchants_service_1.MerchantsService])
], MerchantApiController);
//# sourceMappingURL=merchants.controller.js.map