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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantJwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../prisma/prisma.service");
let MerchantJwtStrategy = class MerchantJwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy, 'merchant-jwt') {
    configService;
    prisma;
    constructor(configService, prisma) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_SECRET') || 'dev-only-insecure-secret',
        });
        this.configService = configService;
        this.prisma = prisma;
    }
    async validate(payload) {
        if (payload.type !== 'merchant') {
            return null;
        }
        const user = await this.prisma.merchantUser.findUnique({
            where: { id: payload.sub },
            include: { merchant: true },
        });
        if (!user || !user.isActive || user.merchant.status !== 'ACTIVE') {
            throw new common_1.UnauthorizedException('Account disabled');
        }
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            merchantId: user.merchantId,
            merchant: user.merchant,
        };
    }
};
exports.MerchantJwtStrategy = MerchantJwtStrategy;
exports.MerchantJwtStrategy = MerchantJwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], MerchantJwtStrategy);
//# sourceMappingURL=merchant-jwt.strategy.js.map