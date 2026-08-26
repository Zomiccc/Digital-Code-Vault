"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FulfillmentModule = void 0;
const common_1 = require("@nestjs/common");
const fulfillment_service_1 = require("./fulfillment.service");
const fulfillment_controller_1 = require("./fulfillment.controller");
const allocation_engine_service_1 = require("./allocation-engine.service");
const scheduled_tasks_service_1 = require("./scheduled-tasks.service");
const webhooks_module_1 = require("../webhooks/webhooks.module");
const auth_module_1 = require("../auth/auth.module");
let FulfillmentModule = class FulfillmentModule {
};
exports.FulfillmentModule = FulfillmentModule;
exports.FulfillmentModule = FulfillmentModule = __decorate([
    (0, common_1.Module)({
        imports: [(0, common_1.forwardRef)(() => webhooks_module_1.WebhooksModule), auth_module_1.AuthModule],
        providers: [fulfillment_service_1.FulfillmentService, allocation_engine_service_1.AllocationEngineService, scheduled_tasks_service_1.ScheduledTasksService],
        controllers: [fulfillment_controller_1.FulfillmentController, fulfillment_controller_1.OrdersController, fulfillment_controller_1.PaymentNotificationController, fulfillment_controller_1.SandboxController],
        exports: [fulfillment_service_1.FulfillmentService, allocation_engine_service_1.AllocationEngineService],
    })
], FulfillmentModule);
//# sourceMappingURL=fulfillment.module.js.map