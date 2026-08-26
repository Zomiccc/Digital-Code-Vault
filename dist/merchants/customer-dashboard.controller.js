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
exports.CustomerDashboardController = void 0;
const common_1 = require("@nestjs/common");
const customer_auth_guard_1 = require("../auth/guards/customer-auth.guard");
const auth_service_1 = require("../auth/auth.service");
const audit_service_1 = require("../audit/audit.service");
const products_service_1 = require("../products/products.service");
const fulfillment_service_1 = require("../fulfillment/fulfillment.service");
const prisma_service_1 = require("../prisma/prisma.service");
const nanoid_1 = require("nanoid");
let CustomerDashboardController = class CustomerDashboardController {
    prisma;
    authService;
    auditService;
    productsService;
    fulfillmentService;
    constructor(prisma, authService, auditService, productsService, fulfillmentService) {
        this.prisma = prisma;
        this.authService = authService;
        this.auditService = auditService;
        this.productsService = productsService;
        this.fulfillmentService = fulfillmentService;
    }
    async listProducts() {
        return this.productsService.listAllProducts();
    }
    async getDenominations(id) {
        return this.productsService.getDenominations(id);
    }
    async createOrder(body, req) {
        if (!body.product_id || !body.amount) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_FIELDS',
                message: 'product_id and amount are required',
            });
        }
        const merchants = await this.prisma.merchant.findMany({
            where: { status: 'ACTIVE' },
            orderBy: { walletBalance: 'desc' },
            take: 1,
        });
        if (merchants.length === 0) {
            throw new common_1.BadRequestException({
                error: 'NO_MERCHANT',
                code: 'NO_ACTIVE_MERCHANT',
                message: 'No active merchant available to fulfill orders',
            });
        }
        const merchant = merchants[0];
        const idempotencyKey = `customer-${(0, nanoid_1.nanoid)(16)}`;
        const customer = await this.prisma.customer.findUnique({ where: { id: req.user.id } });
        const customerEmail = customer?.email || undefined;
        const customerName = customer?.name || customerEmail || undefined;
        try {
            const result = await this.fulfillmentService.createFulfillment({
                merchantId: merchant.id,
                productId: body.product_id,
                amount: body.amount,
                currency: body.currency || 'USD',
                referenceId: body.reference_id || `cust-${req.user.id}`,
                idempotencyKey,
                customerEmail,
                customerName,
                customerAddress: body.customer_address,
                actorType: 'SYSTEM',
                actorId: req.user.id,
                ip: req.ip,
            });
            await this.auditService.log({
                actorType: 'CUSTOMER',
                actorId: req.user.id,
                action: 'customer.order',
                entity: 'FulfillmentRequest',
                entityId: result.fulfillment_id,
                metadata: { merchantId: merchant.id, productId: body.product_id, amount: body.amount },
                ip: req.ip,
            });
            return result;
        }
        catch (err) {
            const isStockError = err.message?.includes('INSUFFICIENT_STOCK') ||
                err.response?.message?.includes('INSUFFICIENT_STOCK') ||
                err.response?.code === 'INSUFFICIENT_STOCK' ||
                (err.response?.message && typeof err.response.message === 'string' && err.response.message.includes('No available stock')) ||
                (err.response?.message && typeof err.response.message === 'string' && err.response.message.includes('No combination'));
            if (isStockError) {
                const pendingIdempotencyKey = `customer-pending-${(0, nanoid_1.nanoid)(16)}`;
                const pendingReq = await this.prisma.fulfillmentRequest.create({
                    data: {
                        merchantId: merchant.id,
                        productId: body.product_id,
                        amount: body.amount,
                        currency: body.currency || 'USD',
                        idempotencyKey: pendingIdempotencyKey,
                        referenceId: body.reference_id || `cust-${req.user.id}`,
                        status: 'PENDING_SUPPLIER',
                        sandbox: false,
                        customerEmail: customerEmail || null,
                        customerName: customerName || null,
                        customerAddress: body.customer_address || null,
                    },
                }).catch(() => null);
                if (pendingReq) {
                    await this.auditService.log({
                        actorType: 'CUSTOMER',
                        actorId: req.user.id,
                        action: 'customer.order_pending_supplier',
                        entity: 'FulfillmentRequest',
                        entityId: pendingReq.id,
                        metadata: { merchantId: merchant.id, productId: body.product_id, amount: body.amount },
                        ip: req.ip,
                    });
                    return {
                        fulfillment_id: pendingReq.id,
                        status: 'PENDING_SUPPLIER',
                        message: 'Your order has been placed and is awaiting stock. You will receive a delivery link once codes become available.',
                    };
                }
            }
            throw err;
        }
    }
    async listOrders(req) {
        const logs = await this.prisma.auditLog.findMany({
            where: {
                actorType: 'CUSTOMER',
                actorId: req.user.id,
                action: { in: ['customer.order', 'customer.order_pending_supplier'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        const fulfillmentIds = logs.map((l) => l.entityId).filter(Boolean);
        if (fulfillmentIds.length === 0)
            return [];
        const fulfillments = await this.prisma.fulfillmentRequest.findMany({
            where: { id: { in: fulfillmentIds } },
            include: {
                product: true,
                deliveryToken: true,
                allocations: true,
            },
        });
        return fulfillments.map((f) => ({
            id: f.id,
            product_name: f.product.name,
            amount: f.amount,
            status: f.status,
            failureReason: f.failureReason,
            createdAt: f.createdAt,
            customer_address: f.customerAddress,
            delivery_link: f.deliveryToken
                ? `/api/v1/reveal/${f.deliveryToken.tokenHash}`
                : null,
            revealed: f.deliveryToken?.revealedAt ? true : false,
        }));
    }
    async becomeMerchant(body, req) {
        const required = ['storeName', 'storeEmail', 'firstName', 'lastName', 'phone', 'idDocType', 'idFrontImage', 'idBackImage', 'businessNtn'];
        const missing = required.filter((f) => !body[f]);
        if (missing.length > 0) {
            throw new common_1.BadRequestException({
                error: 'INVALID_REQUEST',
                code: 'MISSING_FIELDS',
                message: `Missing required fields: ${missing.join(', ')}`,
            });
        }
        return this.authService.customerBecomeMerchant(req.user.id, {
            storeName: body.storeName,
            storeEmail: body.storeEmail,
            currency: body.currency,
            firstName: body.firstName,
            lastName: body.lastName,
            phone: body.phone,
            idDocType: body.idDocType,
            idFrontImage: body.idFrontImage,
            idBackImage: body.idBackImage,
            businessNtn: body.businessNtn,
        }, req.ip);
    }
    async getProfile(req) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: req.user.id },
        });
        if (!customer) {
            throw new common_1.BadRequestException('Customer not found');
        }
        return {
            id: customer.id,
            email: customer.email,
            name: customer.name,
            merchantId: customer.merchantId,
            isMerchant: !!customer.merchantId,
            merchantAppStatus: customer.merchantAppStatus,
        };
    }
};
exports.CustomerDashboardController = CustomerDashboardController;
__decorate([
    (0, common_1.Get)('products'),
    (0, common_1.UseGuards)(customer_auth_guard_1.CustomerAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CustomerDashboardController.prototype, "listProducts", null);
__decorate([
    (0, common_1.Get)('products/:id/denominations'),
    (0, common_1.UseGuards)(customer_auth_guard_1.CustomerAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CustomerDashboardController.prototype, "getDenominations", null);
__decorate([
    (0, common_1.Post)('orders'),
    (0, common_1.UseGuards)(customer_auth_guard_1.CustomerAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CustomerDashboardController.prototype, "createOrder", null);
__decorate([
    (0, common_1.Get)('orders'),
    (0, common_1.UseGuards)(customer_auth_guard_1.CustomerAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CustomerDashboardController.prototype, "listOrders", null);
__decorate([
    (0, common_1.Post)('become-merchant'),
    (0, common_1.UseGuards)(customer_auth_guard_1.CustomerAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CustomerDashboardController.prototype, "becomeMerchant", null);
__decorate([
    (0, common_1.Get)('profile'),
    (0, common_1.UseGuards)(customer_auth_guard_1.CustomerAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CustomerDashboardController.prototype, "getProfile", null);
exports.CustomerDashboardController = CustomerDashboardController = __decorate([
    (0, common_1.Controller)('customer'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService,
        audit_service_1.AuditService,
        products_service_1.ProductsService,
        fulfillment_service_1.FulfillmentService])
], CustomerDashboardController);
//# sourceMappingURL=customer-dashboard.controller.js.map