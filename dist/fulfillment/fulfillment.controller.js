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
exports.SandboxController = exports.PaymentNotificationController = exports.OrdersController = exports.FulfillmentController = void 0;
const common_1 = require("@nestjs/common");
const fulfillment_service_1 = require("./fulfillment.service");
const api_key_guard_1 = require("../auth/guards/api-key.guard");
const scopes_decorator_1 = require("../auth/decorators/scopes.decorator");
const dto_1 = require("../dto");
let FulfillmentController = class FulfillmentController {
    fulfillmentService;
    constructor(fulfillmentService) {
        this.fulfillmentService = fulfillmentService;
    }
    async createFulfillment(body, req) {
        if (!body.product_id || !body.amount) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_FIELDS',
                message: 'product_id and amount are required',
            });
        }
        const idempotencyKey = req.headers['idempotency-key'];
        if (!idempotencyKey) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_IDEMPOTENCY_KEY',
                message: 'Idempotency-Key header is required for fulfillment requests',
            });
        }
        return this.fulfillmentService.createFulfillment({
            merchantId: req.merchantId,
            productId: body.product_id,
            amount: body.amount,
            currency: body.currency || 'USD',
            referenceId: body.reference_id,
            idempotencyKey,
            customerEmail: body.customer_email,
            customerName: body.customer_name,
            customerAddress: body.customer_address,
            actorType: 'MERCHANT',
            ip: req.ip,
            inventorySource: body.inventory_source,
            variantId: body.variant_id,
        });
    }
    async getFulfillment(id, req) {
        return this.fulfillmentService.getFulfillmentStatus(id, req.merchantId);
    }
    async getDeliveryLink(id, req) {
        return this.fulfillmentService.getDeliveryLink(id, req.merchantId);
    }
};
exports.FulfillmentController = FulfillmentController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, scopes_decorator_1.Scopes)('fulfillment'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateFulfillmentDto, Object]),
    __metadata("design:returntype", Promise)
], FulfillmentController.prototype, "createFulfillment", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, scopes_decorator_1.Scopes)('read', 'fulfillment'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], FulfillmentController.prototype, "getFulfillment", null);
__decorate([
    (0, common_1.Get)(':id/delivery-link'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, scopes_decorator_1.Scopes)('read', 'fulfillment'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], FulfillmentController.prototype, "getDeliveryLink", null);
exports.FulfillmentController = FulfillmentController = __decorate([
    (0, common_1.Controller)('fulfillment'),
    __metadata("design:paramtypes", [fulfillment_service_1.FulfillmentService])
], FulfillmentController);
let OrdersController = class OrdersController {
    fulfillmentService;
    constructor(fulfillmentService) {
        this.fulfillmentService = fulfillmentService;
    }
    async getOrderStatus(id, req) {
        return this.fulfillmentService.getOrderStatus(id, req.merchantId);
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, common_1.Get)(':id/status'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, scopes_decorator_1.Scopes)('read', 'fulfillment'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getOrderStatus", null);
exports.OrdersController = OrdersController = __decorate([
    (0, common_1.Controller)('orders'),
    __metadata("design:paramtypes", [fulfillment_service_1.FulfillmentService])
], OrdersController);
let PaymentNotificationController = class PaymentNotificationController {
    fulfillmentService;
    constructor(fulfillmentService) {
        this.fulfillmentService = fulfillmentService;
    }
    async notifyPayment(body, req) {
        if (!body.product_id || !body.amount) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_FIELDS',
                message: 'product_id and amount are required',
            });
        }
        const idempotencyKey = req.headers['idempotency-key'];
        if (!idempotencyKey) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_IDEMPOTENCY_KEY',
                message: 'Idempotency-Key header is required for payment notifications',
            });
        }
        return this.fulfillmentService.createFulfillment({
            merchantId: req.merchantId,
            productId: body.product_id,
            amount: body.amount,
            currency: body.currency || 'USD',
            referenceId: body.reference_id,
            idempotencyKey,
            customerEmail: body.customer_email,
            customerName: body.customer_name,
            customerAddress: body.customer_address,
            actorType: 'MERCHANT',
            ip: req.ip,
            inventorySource: body.inventory_source,
            variantId: body.variant_id,
        });
    }
};
exports.PaymentNotificationController = PaymentNotificationController;
__decorate([
    (0, common_1.Post)('payment'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, scopes_decorator_1.Scopes)('fulfillment'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateFulfillmentDto, Object]),
    __metadata("design:returntype", Promise)
], PaymentNotificationController.prototype, "notifyPayment", null);
exports.PaymentNotificationController = PaymentNotificationController = __decorate([
    (0, common_1.Controller)('notify'),
    __metadata("design:paramtypes", [fulfillment_service_1.FulfillmentService])
], PaymentNotificationController);
let SandboxController = class SandboxController {
    fulfillmentService;
    constructor(fulfillmentService) {
        this.fulfillmentService = fulfillmentService;
    }
    async sandboxFulfillment(body, req) {
        if (!body.product_id || !body.amount) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_FIELDS',
                message: 'product_id and amount are required',
            });
        }
        const idempotencyKey = req.headers['idempotency-key'];
        if (!idempotencyKey) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_IDEMPOTENCY_KEY',
                message: 'Idempotency-Key header is required',
            });
        }
        return this.fulfillmentService.createFulfillment({
            merchantId: req.merchantId,
            productId: body.product_id,
            amount: body.amount,
            currency: body.currency || 'USD',
            referenceId: body.reference_id,
            idempotencyKey,
            customerAddress: body.customer_address,
            sandbox: true,
            actorType: 'MERCHANT',
            ip: req.ip,
            inventorySource: body.inventory_source,
        });
    }
};
exports.SandboxController = SandboxController;
__decorate([
    (0, common_1.Post)('fulfillment'),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, scopes_decorator_1.Scopes)('fulfillment'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateFulfillmentDto, Object]),
    __metadata("design:returntype", Promise)
], SandboxController.prototype, "sandboxFulfillment", null);
exports.SandboxController = SandboxController = __decorate([
    (0, common_1.Controller)('sandbox'),
    __metadata("design:paramtypes", [fulfillment_service_1.FulfillmentService])
], SandboxController);
//# sourceMappingURL=fulfillment.controller.js.map