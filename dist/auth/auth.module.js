"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("./auth.service");
const auth_controller_1 = require("./auth.controller");
const admin_jwt_strategy_1 = require("./strategies/admin-jwt.strategy");
const merchant_jwt_strategy_1 = require("./strategies/merchant-jwt.strategy");
const customer_jwt_strategy_1 = require("./strategies/customer-jwt.strategy");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const combined_auth_guard_1 = require("./guards/combined-auth.guard");
const login_rate_limit_guard_1 = require("./guards/login-rate-limit.guard");
const admin_bootstrap_service_1 = require("./admin-bootstrap.service");
const email_module_1 = require("../email/email.module");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    secret: config.get('JWT_SECRET') || 'dev-only-insecure-secret',
                    signOptions: { expiresIn: '15m' },
                }),
            }),
            email_module_1.EmailModule,
        ],
        providers: [auth_service_1.AuthService, admin_jwt_strategy_1.AdminJwtStrategy, merchant_jwt_strategy_1.MerchantJwtStrategy, customer_jwt_strategy_1.CustomerJwtStrategy, jwt_auth_guard_1.JwtAuthGuard, combined_auth_guard_1.CombinedAuthGuard, login_rate_limit_guard_1.LoginRateLimitGuard, admin_bootstrap_service_1.AdminBootstrapService],
        controllers: [auth_controller_1.AuthController],
        exports: [auth_service_1.AuthService, jwt_1.JwtModule, jwt_auth_guard_1.JwtAuthGuard, combined_auth_guard_1.CombinedAuthGuard],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map