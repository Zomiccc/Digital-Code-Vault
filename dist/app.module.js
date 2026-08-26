"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const prisma_module_1 = require("./prisma/prisma.module");
const encryption_module_1 = require("./encryption/encryption.module");
const audit_module_1 = require("./audit/audit.module");
const redis_module_1 = require("./redis/redis.module");
const auth_module_1 = require("./auth/auth.module");
const merchants_module_1 = require("./merchants/merchants.module");
const products_module_1 = require("./products/products.module");
const codes_module_1 = require("./codes/codes.module");
const fulfillment_module_1 = require("./fulfillment/fulfillment.module");
const delivery_module_1 = require("./delivery/delivery.module");
const webhooks_module_1 = require("./webhooks/webhooks.module");
const admin_module_1 = require("./admin/admin.module");
const health_module_1 = require("./health/health.module");
const email_module_1 = require("./email/email.module");
const wallet_module_1 = require("./wallet/wallet.module");
const catalog_module_1 = require("./catalog/catalog.module");
const essentials_module_1 = require("./essentials/essentials.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env', '.env.dev', '../../.env', '../../.env.dev'],
            }),
            schedule_1.ScheduleModule.forRoot(),
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            encryption_module_1.EncryptionModule,
            audit_module_1.AuditModule,
            auth_module_1.AuthModule,
            merchants_module_1.MerchantsModule,
            products_module_1.ProductsModule,
            codes_module_1.CodesModule,
            fulfillment_module_1.FulfillmentModule,
            delivery_module_1.DeliveryModule,
            webhooks_module_1.WebhooksModule,
            admin_module_1.AdminModule,
            health_module_1.HealthModule,
            email_module_1.EmailModule,
            wallet_module_1.WalletModule,
            catalog_module_1.CatalogModule,
            essentials_module_1.EssentialsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map