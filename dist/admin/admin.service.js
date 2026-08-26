"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AdminService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const encryption_service_1 = require("../encryption/encryption.service");
const merchants_service_1 = require("../merchants/merchants.service");
const products_service_1 = require("../products/products.service");
const codes_service_1 = require("../codes/codes.service");
const fulfillment_service_1 = require("../fulfillment/fulfillment.service");
const argon2 = __importStar(require("argon2"));
let AdminService = AdminService_1 = class AdminService {
    prisma;
    configService;
    auditService;
    encryptionService;
    merchantsService;
    productsService;
    codesService;
    fulfillmentService;
    logger = new common_1.Logger(AdminService_1.name);
    constructor(prisma, configService, auditService, encryptionService, merchantsService, productsService, codesService, fulfillmentService) {
        this.prisma = prisma;
        this.configService = configService;
        this.auditService = auditService;
        this.encryptionService = encryptionService;
        this.merchantsService = merchantsService;
        this.productsService = productsService;
        this.codesService = codesService;
        this.fulfillmentService = fulfillmentService;
    }
    async getDashboardStats() {
        const [totalMerchants, activeMerchants, totalProducts, totalCodes, inventoryStats, pendingFulfillments, allocatedFulfillments, deliveredFulfillments,] = await Promise.all([
            this.prisma.merchant.count(),
            this.prisma.merchant.count({ where: { status: 'ACTIVE' } }),
            this.prisma.product.count(),
            this.prisma.codeItem.count(),
            this.codesService.getInventoryStats(),
            this.prisma.fulfillmentRequest.count({ where: { status: 'PENDING' } }),
            this.prisma.fulfillmentRequest.count({ where: { status: 'ALLOCATED' } }),
            this.prisma.fulfillmentRequest.count({ where: { status: 'DELIVERED' } }),
        ]);
        return {
            merchants: { total: totalMerchants, active: activeMerchants },
            products: totalProducts,
            codes: { total: totalCodes, ...inventoryStats },
            fulfillment: {
                pending: pendingFulfillments,
                allocated: allocatedFulfillments,
                delivered: deliveredFulfillments,
            },
        };
    }
    async createAdminUser(data, creatorId, ip) {
        const existing = await this.prisma.adminUser.findUnique({ where: { email: data.email } });
        if (existing) {
            throw new common_1.BadRequestException('Admin with this email already exists');
        }
        const passwordHash = await argon2.hash(data.password);
        const admin = await this.prisma.adminUser.create({
            data: {
                email: data.email,
                name: data.name,
                passwordHash,
                role: data.role,
            },
        });
        await this.auditService.log({
            actorType: 'ADMIN',
            actorId: creatorId,
            action: 'admin.create',
            entity: 'AdminUser',
            entityId: admin.id,
            metadata: { email: admin.email, role: admin.role },
            ip,
        });
        return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
    }
    async listAdminUsers() {
        return this.prisma.adminUser.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async createSupplier(data) {
        return this.prisma.supplier.create({ data });
    }
    async listSuppliers() {
        return this.prisma.supplier.findMany({
            include: { _count: { select: { products: true, codeItems: true } } },
        });
    }
    async listAllFulfillmentRequests(limit = 50, offset = 0) {
        const [reqs, total] = await Promise.all([
            this.prisma.fulfillmentRequest.findMany({
                include: {
                    merchant: { select: { id: true, name: true, email: true, address: true } },
                    product: { select: { id: true, name: true, region: true } },
                    allocations: true,
                    deliveryToken: true,
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            this.prisma.fulfillmentRequest.count(),
        ]);
        return {
            items: reqs.map((r) => ({
                id: r.id,
                merchant: r.merchant,
                product: r.product,
                amount: r.amount,
                currency: r.currency,
                status: r.status,
                reference_id: r.referenceId,
                customer_name: r.customerName,
                customer_email: r.customerEmail,
                customer_address: r.customerAddress,
                merchant_address: r.merchant.address,
                created_at: r.createdAt,
                failure_reason: r.failureReason,
                revealed: r.deliveryToken?.revealedAt ? true : false,
            })),
            total,
        };
    }
    async reverseFulfillment(fulfillmentId, adminId, ip) {
        return this.fulfillmentService.reverseFulfillment(fulfillmentId, adminId, ip);
    }
    async getAuditLogs(limit = 50, offset = 0, entity, action) {
        return this.auditService.getLogs({ entity, action, limit, offset });
    }
    async getApiLogs(limit = 50, offset = 0) {
        const result = await this.auditService.getLogs({
            action: 'apikey',
            limit,
            offset,
        });
        return result;
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = AdminService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        audit_service_1.AuditService,
        encryption_service_1.EncryptionService,
        merchants_service_1.MerchantsService,
        products_service_1.ProductsService,
        codes_service_1.CodesService,
        fulfillment_service_1.FulfillmentService])
], AdminService);
//# sourceMappingURL=admin.service.js.map