import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../encryption/encryption.service';
import { MerchantsService } from '../merchants/merchants.service';
import { ProductsService } from '../products/products.service';
import { CodesService } from '../codes/codes.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import * as argon2 from 'argon2';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private auditService: AuditService,
    private encryptionService: EncryptionService,
    private merchantsService: MerchantsService,
    private productsService: ProductsService,
    private codesService: CodesService,
    private fulfillmentService: FulfillmentService,
  ) {}

  // ─── Dashboard Stats ───

  async getDashboardStats() {
    const [
      totalMerchants,
      activeMerchants,
      totalProducts,
      totalCodes,
      inventoryStats,
      pendingFulfillments,
      allocatedFulfillments,
      deliveredFulfillments,
    ] = await Promise.all([
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

  // ─── Staff Management ───

  async createAdminUser(data: { email: string; name: string; password: string; role: string }, creatorId: string, ip?: string) {
    const existing = await this.prisma.adminUser.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new BadRequestException('Admin with this email already exists');
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

  // ─── Suppliers ───

  async createSupplier(data: { name: string; contactInfo?: string }) {
    return this.prisma.supplier.create({ data });
  }

  async listSuppliers() {
    return this.prisma.supplier.findMany({
      include: { _count: { select: { products: true, codeItems: true } } },
    });
  }

  // ─── Fulfillment Monitoring ───

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
        discountAmount: r.discountAmount,
        netAmount: (Math.round(Number(r.amount) * 100) - Math.round(Number(r.discountAmount) * 100)) / 100,
        walletCharged: r.walletCharged,
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

  async reverseFulfillment(fulfillmentId: string, adminId: string, ip?: string) {
    return this.fulfillmentService.reverseFulfillment(fulfillmentId, adminId, ip);
  }

  // ─── Audit Logs ───

  async getAuditLogs(limit = 50, offset = 0, entity?: string, action?: string) {
    return this.auditService.getLogs({ entity, action, limit, offset });
  }

  // ─── API Logs (from audit log filtered for API actions) ───

  async getApiLogs(limit = 50, offset = 0) {
    const result = await this.auditService.getLogs({
      action: 'apikey',
      limit,
      offset,
    });
    return result;
  }
}
