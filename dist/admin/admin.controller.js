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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("./admin.service");
const merchants_service_1 = require("../merchants/merchants.service");
const products_service_1 = require("../products/products.service");
const codes_service_1 = require("../codes/codes.service");
const essentials_service_1 = require("../essentials/essentials.service");
const auth_service_1 = require("../auth/auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
const wallet_service_1 = require("../wallet/wallet.service");
const delivery_service_1 = require("../delivery/delivery.service");
const support_service_1 = require("../merchants/support.service");
const fulfillment_service_1 = require("../fulfillment/fulfillment.service");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const admin_auth_guard_1 = require("../auth/guards/admin-auth.guard");
const dto_1 = require("../dto");
let AdminController = class AdminController {
    adminService;
    merchantsService;
    productsService;
    codesService;
    essentialsService;
    authService;
    prisma;
    walletService;
    deliveryService;
    supportService;
    fulfillmentService;
    constructor(adminService, merchantsService, productsService, codesService, essentialsService, authService, prisma, walletService, deliveryService, supportService, fulfillmentService) {
        this.adminService = adminService;
        this.merchantsService = merchantsService;
        this.productsService = productsService;
        this.codesService = codesService;
        this.essentialsService = essentialsService;
        this.authService = authService;
        this.prisma = prisma;
        this.walletService = walletService;
        this.deliveryService = deliveryService;
        this.supportService = supportService;
        this.fulfillmentService = fulfillmentService;
    }
    async getStats() {
        return this.adminService.getDashboardStats();
    }
    async listMerchants() {
        return this.merchantsService.listMerchants();
    }
    async createMerchant(body, user, req) {
        return this.merchantsService.createMerchant(body);
    }
    async updateMerchantStatus(id, body) {
        return this.merchantsService.updateMerchantStatus(id, body.status);
    }
    async creditWallet(id, body, user, req) {
        return this.merchantsService.addWalletCredit(id, body.amount, user.id, req.ip);
    }
    async getAdminWallet() {
        return this.walletService.getAdminWallet();
    }
    async getAdminWalletTransactions(limit, offset) {
        return this.walletService.getAdminWalletTransactions(limit ? parseInt(limit) : 50, offset ? parseInt(offset) : 0);
    }
    async listFundingRequests(status) {
        return this.walletService.listFundingRequests(undefined, status);
    }
    async approveFundingRequest(id, body, user, req) {
        return this.walletService.approveFundingRequest(id, user.id, body.note, req.ip);
    }
    async rejectFundingRequest(id, body, user, req) {
        return this.walletService.rejectFundingRequest(id, user.id, body.note, req.ip);
    }
    async getReconciliationReport(limit, offset) {
        return this.walletService.getReconciliationReport(limit ? parseInt(limit) : 100, offset ? parseInt(offset) : 0);
    }
    async getMerchantFinance(id) {
        return this.walletService.getMerchantFinanceDetail(id);
    }
    async listProducts() {
        return this.productsService.listAllProducts();
    }
    async createProduct(body) {
        return this.productsService.createProduct({
            name: body.name,
            region: body.region,
            supplierId: body.supplier_id,
            categoryId: body.category_id,
            productType: body.product_type,
        });
    }
    async updateProductType(id, body) {
        return this.productsService.updateProductType(id, body.product_type);
    }
    async updateProductCategory(id, body) {
        return this.productsService.updateProductCategory(id, body.category_id || null);
    }
    async createDenomination(id, body) {
        return this.productsService.createDenomination(id, body.face_value, body.currency);
    }
    async getEssentialsDeliveryConfig(id) {
        return this.essentialsService.getDeliveryConfig(id);
    }
    async saveEssentialsDeliveryConfig(id, body, user) {
        return this.essentialsService.saveDeliveryConfig(id, body.items || [], user?.id);
    }
    async getEssentialsAvailability(id) {
        return this.essentialsService.getAvailability(id);
    }
    async listSuppliers() {
        return this.adminService.listSuppliers();
    }
    async createSupplier(body) {
        return this.adminService.createSupplier(body);
    }
    async listCodes(denominationId, status, batchId, limit, offset) {
        return this.codesService.listCodes({
            denominationId,
            status,
            batchId,
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0,
        });
    }
    async bulkUploadCodes(body, user, req) {
        return this.codesService.bulkUpload(body.denomination_id, body.codes, user.id, body.supplier_id, req.ip, { costPerCode: body.cost_per_code, currency: body.currency, note: body.note });
    }
    async createManualOrder(body, user, req) {
        if (!body.productId || !body.amount) {
            throw new common_1.BadRequestException('productId and amount are required');
        }
        let platformMerchant = await this.prisma.merchant.findUnique({
            where: { email: 'admin-orders@platform.internal' },
        });
        if (!platformMerchant) {
            platformMerchant = await this.prisma.merchant.create({
                data: {
                    name: 'Admin Manual Orders',
                    email: 'admin-orders@platform.internal',
                    status: 'ACTIVE',
                    currency: 'USD',
                    allowedProductIds: JSON.stringify([]),
                },
            });
        }
        const result = await this.fulfillmentService.createFulfillment({
            merchantId: platformMerchant.id,
            productId: body.productId,
            amount: Number(body.amount),
            currency: body.currency || 'USD',
            referenceId: `admin-${user.id.slice(0, 8)}-${Date.now()}`,
            idempotencyKey: `admin-manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            customerEmail: body.customerEmail,
            customerName: body.customerName,
            actorType: 'ADMIN',
            actorId: user.id,
            ip: req.ip,
            variantId: body.variantId || undefined,
        });
        return result;
    }
    async getEmergencyStop() {
        const setting = await this.prisma.platformSetting.findUnique({ where: { key: 'EMERGENCY_STOP' } });
        return { active: setting?.value === 'true', updatedAt: setting?.updatedAt || null };
    }
    async setEmergencyStop(body, user) {
        await this.prisma.platformSetting.upsert({
            where: { key: 'EMERGENCY_STOP' },
            create: { key: 'EMERGENCY_STOP', value: body.enabled ? 'true' : 'false' },
            update: { value: body.enabled ? 'true' : 'false' },
        });
        return { active: body.enabled };
    }
    async revealCode(id, user, req) {
        return this.codesService.revealCode(id, user.id, req.ip);
    }
    async voidCode(id, user, req) {
        return this.codesService.voidCode(id, user.id, req.ip);
    }
    async getInventoryStats() {
        return this.codesService.getInventoryStats();
    }
    async listFulfillment(limit, offset) {
        return this.adminService.listAllFulfillmentRequests(limit ? parseInt(limit) : 50, offset ? parseInt(offset) : 0);
    }
    async reverseFulfillment(id, user, req) {
        return this.adminService.reverseFulfillment(id, user.id, req.ip);
    }
    async regenerateDeliveryLink(id, user) {
        return this.deliveryService.regenerateDeliveryLink(id, user.id);
    }
    async listSupportThreads() {
        return this.supportService.adminListThreads();
    }
    async getSupportThread(merchantId) {
        return this.supportService.adminGetThread(merchantId);
    }
    async replySupportThread(merchantId, body, user) {
        return this.supportService.adminSendMessage(merchantId, user.name || user.email, body.body);
    }
    async listPendingSupplierRequests() {
        const pending = await this.prisma.fulfillmentRequest.findMany({
            where: { status: 'PENDING_SUPPLIER' },
            include: { product: true },
            orderBy: { createdAt: 'asc' },
            take: 100,
        });
        return {
            items: pending.map((r) => ({
                id: r.id,
                product: r.product.name,
                product_id: r.productId,
                amount: r.amount,
                currency: r.currency,
                reference_id: r.referenceId,
                merchant_id: r.merchantId,
                created_at: r.createdAt,
            })),
            total: pending.length,
        };
    }
    async listStaff() {
        return this.adminService.listAdminUsers();
    }
    async createStaff(body, user, req) {
        return this.adminService.createAdminUser(body, user.id, req.ip);
    }
    async getAuditLogs(limit, offset, entity, action) {
        return this.adminService.getAuditLogs(limit ? parseInt(limit) : 50, offset ? parseInt(offset) : 0, entity, action);
    }
    async getApiLogs(limit, offset) {
        return this.adminService.getApiLogs(limit ? parseInt(limit) : 50, offset ? parseInt(offset) : 0);
    }
    async listMerchantApplications(status) {
        return this.authService.listMerchantApplications(status);
    }
    async approveMerchantApplication(id, user, req) {
        return this.authService.approveMerchantApplication(id, user.id, req.ip);
    }
    async rejectMerchantApplication(id, body, user, req) {
        return this.authService.rejectMerchantApplication(id, user.id, body.note || 'Application rejected', req.ip);
    }
    async initializeWallet(body, user, req) {
        return this.walletService.initializeAdminWallet(body.amount, body.description || 'Manual funding', user.id, req.ip);
    }
    async createConnectedProductAdmin(body) {
        if (!body.merchant_id || !body.platform || !body.platform_sku || !body.name) {
            throw new common_1.BadRequestException('merchant_id, platform, platform_sku and name are required');
        }
        return this.prisma.connectedProduct.create({
            data: {
                merchantId: body.merchant_id,
                platform: body.platform,
                platformSku: body.platform_sku,
                sku: body.platform_sku,
                name: body.name,
                dcvProductId: body.dcv_product_id || null,
                dcvDenominationId: body.dcv_denomination_id || null,
                dcvVariantId: body.dcv_variant_id || null,
                inventorySource: 'DCV',
                status: 'ACTIVE',
            },
            include: {
                merchant: { select: { id: true, name: true, email: true } },
                dcvProduct: { select: { id: true, name: true, region: true } },
            },
        });
    }
    async listConnectedProductsAdmin(merchantId, unmapped) {
        return this.prisma.connectedProduct.findMany({
            where: {
                ...(merchantId ? { merchantId } : {}),
                ...(unmapped === 'true' ? { dcvProductId: null } : {}),
            },
            include: {
                merchant: { select: { id: true, name: true, email: true } },
                dcvProduct: { select: { id: true, name: true, region: true } },
            },
            orderBy: { lastSyncedAt: 'desc' },
            take: 500,
        });
    }
    async updateConnectedProductAdmin(id, body) {
        const cp = await this.prisma.connectedProduct.findUnique({ where: { id } });
        if (!cp)
            throw new common_1.NotFoundException('Connected product not found');
        const data = {};
        if (body.dcv_product_id !== undefined)
            data.dcvProductId = body.dcv_product_id || null;
        if (body.dcv_denomination_id !== undefined)
            data.dcvDenominationId = body.dcv_denomination_id || null;
        if (body.dcv_variant_id !== undefined)
            data.dcvVariantId = body.dcv_variant_id || null;
        if (body.sku !== undefined)
            data.platformSku = body.sku || null;
        if (body.inventory_source !== undefined)
            data.inventorySource = body.inventory_source;
        return this.prisma.connectedProduct.update({
            where: { id },
            data,
            include: {
                merchant: { select: { id: true, name: true, email: true } },
                dcvProduct: { select: { id: true, name: true, region: true } },
            },
        });
    }
    async deleteConnectedProductAdmin(id) {
        await this.prisma.connectedProduct.delete({ where: { id } });
        return { id, deleted: true };
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('merchants'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listMerchants", null);
__decorate([
    (0, common_1.Post)('merchants'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateMerchantDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createMerchant", null);
__decorate([
    (0, common_1.Patch)('merchants/:id/status'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateMerchantStatusDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateMerchantStatus", null);
__decorate([
    (0, common_1.Post)('merchants/:id/wallet/credit'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'FINANCE'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.CreditWalletDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "creditWallet", null);
__decorate([
    (0, common_1.Get)('wallet'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getAdminWallet", null);
__decorate([
    (0, common_1.Get)('wallet/transactions'),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getAdminWalletTransactions", null);
__decorate([
    (0, common_1.Get)('wallet/funding-requests'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listFundingRequests", null);
__decorate([
    (0, common_1.Post)('wallet/funding-requests/:id/approve'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'FINANCE'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.FundingRequestActionDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "approveFundingRequest", null);
__decorate([
    (0, common_1.Post)('wallet/funding-requests/:id/reject'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'FINANCE'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.FundingRequestActionDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "rejectFundingRequest", null);
__decorate([
    (0, common_1.Get)('wallet/reconciliation'),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getReconciliationReport", null);
__decorate([
    (0, common_1.Get)('merchants/:id/finance'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getMerchantFinance", null);
__decorate([
    (0, common_1.Get)('products'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listProducts", null);
__decorate([
    (0, common_1.Post)('products'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateProductDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createProduct", null);
__decorate([
    (0, common_1.Patch)('products/:id/type'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateProductType", null);
__decorate([
    (0, common_1.Patch)('products/:id/category'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateProductCategory", null);
__decorate([
    (0, common_1.Post)('products/:id/denominations'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.CreateDenominationDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createDenomination", null);
__decorate([
    (0, common_1.Get)('products/:id/essentials/delivery-config'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getEssentialsDeliveryConfig", null);
__decorate([
    (0, common_1.Post)('products/:id/essentials/delivery-config'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "saveEssentialsDeliveryConfig", null);
__decorate([
    (0, common_1.Get)('products/:id/essentials/availability'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getEssentialsAvailability", null);
__decorate([
    (0, common_1.Get)('suppliers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listSuppliers", null);
__decorate([
    (0, common_1.Post)('suppliers'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateSupplierDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createSupplier", null);
__decorate([
    (0, common_1.Get)('codes'),
    __param(0, (0, common_1.Query)('denominationId')),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('batchId')),
    __param(3, (0, common_1.Query)('limit')),
    __param(4, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listCodes", null);
__decorate([
    (0, common_1.Post)('codes/bulk-upload'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.BulkUploadCodesDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "bulkUploadCodes", null);
__decorate([
    (0, common_1.Post)('orders/create'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'SUPPORT', 'FINANCE'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createManualOrder", null);
__decorate([
    (0, common_1.Get)('system/emergency'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getEmergencyStop", null);
__decorate([
    (0, common_1.Post)('system/emergency'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "setEmergencyStop", null);
__decorate([
    (0, common_1.Post)('codes/:id/reveal'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "revealCode", null);
__decorate([
    (0, common_1.Post)('codes/:id/void'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "voidCode", null);
__decorate([
    (0, common_1.Get)('inventory/stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getInventoryStats", null);
__decorate([
    (0, common_1.Get)('fulfillment'),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listFulfillment", null);
__decorate([
    (0, common_1.Post)('fulfillment/:id/reverse'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "reverseFulfillment", null);
__decorate([
    (0, common_1.Post)('fulfillment/:id/delivery-link/regenerate'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'SUPPORT', 'INVENTORY_MANAGER', 'FINANCE'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "regenerateDeliveryLink", null);
__decorate([
    (0, common_1.Get)('support/threads'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'SUPPORT', 'FINANCE'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listSupportThreads", null);
__decorate([
    (0, common_1.Get)('support/threads/:merchantId'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'SUPPORT', 'FINANCE'),
    __param(0, (0, common_1.Param)('merchantId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getSupportThread", null);
__decorate([
    (0, common_1.Post)('support/threads/:merchantId/messages'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'SUPPORT', 'FINANCE'),
    __param(0, (0, common_1.Param)('merchantId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "replySupportThread", null);
__decorate([
    (0, common_1.Get)('fulfillment/pending-supplier'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listPendingSupplierRequests", null);
__decorate([
    (0, common_1.Get)('staff'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listStaff", null);
__decorate([
    (0, common_1.Post)('staff'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateAdminUserDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createStaff", null);
__decorate([
    (0, common_1.Get)('audit-logs'),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('offset')),
    __param(2, (0, common_1.Query)('entity')),
    __param(3, (0, common_1.Query)('action')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getAuditLogs", null);
__decorate([
    (0, common_1.Get)('api-logs'),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getApiLogs", null);
__decorate([
    (0, common_1.Get)('merchant-applications'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listMerchantApplications", null);
__decorate([
    (0, common_1.Post)('merchant-applications/:id/approve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "approveMerchantApplication", null);
__decorate([
    (0, common_1.Post)('merchant-applications/:id/reject'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "rejectMerchantApplication", null);
__decorate([
    (0, common_1.Post)('wallet/initialize'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "initializeWallet", null);
__decorate([
    (0, common_1.Post)('connected-products'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createConnectedProductAdmin", null);
__decorate([
    (0, common_1.Get)('connected-products'),
    __param(0, (0, common_1.Query)('merchantId')),
    __param(1, (0, common_1.Query)('unmapped')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listConnectedProductsAdmin", null);
__decorate([
    (0, common_1.Patch)('connected-products/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateConnectedProductAdmin", null);
__decorate([
    (0, common_1.Delete)('connected-products/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteConnectedProductAdmin", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_auth_guard_1.AdminAuthGuard),
    __metadata("design:paramtypes", [admin_service_1.AdminService,
        merchants_service_1.MerchantsService,
        products_service_1.ProductsService,
        codes_service_1.CodesService,
        essentials_service_1.EssentialsService,
        auth_service_1.AuthService,
        prisma_service_1.PrismaService,
        wallet_service_1.WalletService,
        delivery_service_1.DeliveryService,
        support_service_1.SupportService,
        fulfillment_service_1.FulfillmentService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map