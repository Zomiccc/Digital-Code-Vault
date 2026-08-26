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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const login_rate_limit_guard_1 = require("./guards/login-rate-limit.guard");
const auth_dto_1 = require("../dto/auth.dto");
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async adminLogin(body, req) {
        return this.authService.adminLogin(body.email, body.password, req.ip);
    }
    async adminRefresh(body) {
        return this.authService.adminRefresh(body.refresh_token);
    }
    async merchantLogin(body, req) {
        return this.authService.merchantLogin(body.email, body.password, req.ip);
    }
    async merchantRefresh(body) {
        return this.authService.merchantRefresh(body.refresh_token);
    }
    async customerRegister(body, req) {
        return this.authService.customerRegister(body, req.ip);
    }
    async customerLogin(body, req) {
        return this.authService.customerLogin(body.email, body.password, req.ip);
    }
    async customerRefresh(body) {
        return this.authService.customerRefresh(body.refresh_token);
    }
    async requestCustomerCode(body) {
        return this.authService.requestCustomerVerificationCode(body.email);
    }
    async customerLoginWithCode(body, req) {
        return this.authService.verifyCustomerCodeAndLogin(body.email, body.code, req.ip);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('admin/login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(login_rate_limit_guard_1.LoginRateLimitGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.AdminLoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "adminLogin", null);
__decorate([
    (0, common_1.Post)('admin/refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RefreshTokenDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "adminRefresh", null);
__decorate([
    (0, common_1.Post)('merchant/login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(login_rate_limit_guard_1.LoginRateLimitGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.MerchantLoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "merchantLogin", null);
__decorate([
    (0, common_1.Post)('merchant/refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RefreshTokenDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "merchantRefresh", null);
__decorate([
    (0, common_1.Post)('customer/register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, common_1.UseGuards)(login_rate_limit_guard_1.LoginRateLimitGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.CustomerRegisterDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "customerRegister", null);
__decorate([
    (0, common_1.Post)('customer/login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(login_rate_limit_guard_1.LoginRateLimitGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.CustomerLoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "customerLogin", null);
__decorate([
    (0, common_1.Post)('customer/refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RefreshTokenDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "customerRefresh", null);
__decorate([
    (0, common_1.Post)('customer/request-code'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(login_rate_limit_guard_1.LoginRateLimitGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "requestCustomerCode", null);
__decorate([
    (0, common_1.Post)('customer/login-with-code'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(login_rate_limit_guard_1.LoginRateLimitGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "customerLoginWithCode", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map