"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminModule = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("./admin.service");
const admin_controller_1 = require("./admin.controller");
const merchants_module_1 = require("../merchants/merchants.module");
const products_module_1 = require("../products/products.module");
const codes_module_1 = require("../codes/codes.module");
const fulfillment_module_1 = require("../fulfillment/fulfillment.module");
const auth_module_1 = require("../auth/auth.module");
const passport_1 = require("@nestjs/passport");
const essentials_module_1 = require("../essentials/essentials.module");
const delivery_module_1 = require("../delivery/delivery.module");
let AdminModule = class AdminModule {
};
exports.AdminModule = AdminModule;
exports.AdminModule = AdminModule = __decorate([
    (0, common_1.Module)({
        imports: [merchants_module_1.MerchantsModule, products_module_1.ProductsModule, codes_module_1.CodesModule, fulfillment_module_1.FulfillmentModule, auth_module_1.AuthModule, passport_1.PassportModule, essentials_module_1.EssentialsModule, delivery_module_1.DeliveryModule],
        providers: [admin_service_1.AdminService],
        controllers: [admin_controller_1.AdminController],
    })
], AdminModule);
//# sourceMappingURL=admin.module.js.map