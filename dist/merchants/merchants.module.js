"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantsModule = void 0;
const common_1 = require("@nestjs/common");
const merchants_service_1 = require("./merchants.service");
const support_service_1 = require("./support.service");
const merchants_controller_1 = require("./merchants.controller");
const merchant_dashboard_controller_1 = require("./merchant-dashboard.controller");
const customer_dashboard_controller_1 = require("./customer-dashboard.controller");
const plugin_download_service_1 = require("./plugin-download.service");
const auth_module_1 = require("../auth/auth.module");
const fulfillment_module_1 = require("../fulfillment/fulfillment.module");
const products_module_1 = require("../products/products.module");
const codes_module_1 = require("../codes/codes.module");
let MerchantsModule = class MerchantsModule {
};
exports.MerchantsModule = MerchantsModule;
exports.MerchantsModule = MerchantsModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, fulfillment_module_1.FulfillmentModule, products_module_1.ProductsModule, codes_module_1.CodesModule],
        providers: [merchants_service_1.MerchantsService, support_service_1.SupportService, plugin_download_service_1.PluginDownloadService],
        controllers: [merchants_controller_1.WalletController, merchants_controller_1.MerchantApiController, merchant_dashboard_controller_1.MerchantDashboardController, customer_dashboard_controller_1.CustomerDashboardController],
        exports: [merchants_service_1.MerchantsService, support_service_1.SupportService],
    })
], MerchantsModule);
//# sourceMappingURL=merchants.module.js.map