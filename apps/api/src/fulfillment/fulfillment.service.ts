import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { AllocationEngineService, AllocationResult } from './allocation-engine.service';
import { WebhookService } from '../webhooks/webhook.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private auditService: AuditService,
    private allocationEngine: AllocationEngineService,
    private webhookService: WebhookService,
  ) {}

  async createFulfillment(params: {
    merchantId: string;
    productId: string;
    amount: number;
    currency: string;
    referenceId?: string;
    idempotencyKey: string;
    sandbox?: boolean;
    actorId?: string;
    actorType?: 'ADMIN' | 'MERCHANT' | 'SYSTEM';
    ip?: string;
  }) {
    const { merchantId, productId, amount, currency, referenceId, idempotencyKey, sandbox, actorId, actorType, ip } = params;

    // Validate amount
    if (amount <= 0) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'INVALID_AMOUNT',
        message: 'Amount must be greater than 0',
      });
    }

    // Check idempotency at DB level
    const existing = await this.prisma.fulfillmentRequest.findUnique({
      where: {
        merchantId_idempotencyKey: { merchantId, idempotencyKey },
      },
      include: {
        allocations: true,
        deliveryToken: true,
      },
    });

    if (existing) {
      // Return the original result
      return this.formatFulfillmentResponse(existing);
    }

    // Check merchant is active
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant || merchant.status !== 'ACTIVE') {
      throw new BadRequestException({
        error: 'MERCHANT_DISABLED',
        code: 'MERCHANT_DISABLED',
        message: 'Merchant account is not active',
      });
    }

    // Check product exists and merchant has access
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.status !== 'ACTIVE') {
      throw new NotFoundException({
        error: 'NOT_FOUND',
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product not found or inactive',
      });
    }

    const allowedIds: string[] = JSON.parse(merchant.allowedProductIds || '[]');
    if (allowedIds.length > 0 && !allowedIds.includes(productId)) {
      throw new BadRequestException({
        error: 'FORBIDDEN',
        code: 'PRODUCT_NOT_ALLOWED',
        message: 'Merchant does not have access to this product',
      });
    }

    // Get available stock
    const stock = await this.allocationEngine.getAvailableStock(this.prisma, productId);
    const availableDenominations = stock.filter((s) => s.availableCount > 0);

    if (availableDenominations.length === 0) {
      // Create a failed fulfillment record
      const failedReq = await this.prisma.fulfillmentRequest.create({
        data: {
          merchantId,
          productId,
          amount,
          currency,
          idempotencyKey,
          referenceId,
          status: 'FAILED',
          failureReason: 'No available stock for this product',
          sandbox: sandbox || false,
        },
      });

      await this.auditService.log({
        actorType: actorType || 'SYSTEM',
        actorId: actorId || merchantId,
        action: 'fulfillment.failed',
        entity: 'FulfillmentRequest',
        entityId: failedReq.id,
        metadata: { reason: 'INSUFFICIENT_STOCK', productId, amount },
        ip,
      });

      // Fire webhook
      this.webhookService.queueWebhookEvent(merchantId, 'fulfillment.failed', {
        fulfillment_id: failedReq.id,
        reference_id: referenceId,
        reason: 'INSUFFICIENT_STOCK',
      }).catch(() => {});

      throw new BadRequestException({
        error: 'INSUFFICIENT_STOCK',
        code: 'INSUFFICIENT_STOCK',
        message: 'No available stock for this product',
      });
    }

    // Find best combination
    const combination = this.allocationEngine.findBestCombination(availableDenominations, amount);
    if (!combination) {
      const failedReq = await this.prisma.fulfillmentRequest.create({
        data: {
          merchantId,
          productId,
          amount,
          currency,
          idempotencyKey,
          referenceId,
          status: 'FAILED',
          failureReason: `No denomination combination sums to ${amount}`,
          sandbox: sandbox || false,
        },
      });

      await this.auditService.log({
        actorType: actorType || 'SYSTEM',
        actorId: actorId || merchantId,
        action: 'fulfillment.failed',
        entity: 'FulfillmentRequest',
        entityId: failedReq.id,
        metadata: { reason: 'INSUFFICIENT_STOCK', productId, amount },
        ip,
      });

      this.webhookService.queueWebhookEvent(merchantId, 'fulfillment.failed', {
        fulfillment_id: failedReq.id,
        reference_id: referenceId,
        reason: 'INSUFFICIENT_STOCK',
      }).catch(() => {});

      throw new BadRequestException({
        error: 'INSUFFICIENT_STOCK',
        code: 'INSUFFICIENT_STOCK',
        message: `No combination of available denominations sums to ${amount}`,
      });
    }

    // Calculate total cost
    const totalCost = combination.reduce((acc, c) => acc + c.faceValue * c.count, 0);

    // Check wallet balance
    if (merchant.walletBalance < totalCost) {
      const failedReq = await this.prisma.fulfillmentRequest.create({
        data: {
          merchantId,
          productId,
          amount,
          currency,
          idempotencyKey,
          referenceId,
          status: 'FAILED',
          failureReason: 'Insufficient wallet balance',
          sandbox: sandbox || false,
        },
      });

      await this.auditService.log({
        actorType: actorType || 'SYSTEM',
        actorId: actorId || merchantId,
        action: 'fulfillment.failed',
        entity: 'FulfillmentRequest',
        entityId: failedReq.id,
        metadata: { reason: 'INSUFFICIENT_WALLET', balance: merchant.walletBalance, required: totalCost },
        ip,
      });

      this.webhookService.queueWebhookEvent(merchantId, 'fulfillment.failed', {
        fulfillment_id: failedReq.id,
        reference_id: referenceId,
        reason: 'INSUFFICIENT_WALLET',
      }).catch(() => {});

      throw new BadRequestException({
        error: 'INSUFFICIENT_WALLET',
        code: 'INSUFFICIENT_WALLET',
        message: `Insufficient wallet balance. Required: ${totalCost}, Available: ${merchant.walletBalance}`,
      });
    }

    const reservationTtl = this.configService.get<number>('RESERVATION_TTL_MINUTES', 15);

    // Execute everything in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create fulfillment request
      const fulfillmentReq = await tx.fulfillmentRequest.create({
        data: {
          merchantId,
          productId,
          amount,
          currency,
          idempotencyKey,
          referenceId,
          status: 'PENDING',
          sandbox: sandbox || false,
        },
      });

      // 2. Reserve codes with row-level locking
      let allocationResults: AllocationResult[];
      try {
        allocationResults = await this.allocationEngine.reserveCodes(
          tx,
          fulfillmentReq.id,
          combination,
          reservationTtl,
        );
      } catch (err) {
        await this.allocationEngine.releaseReservation(tx, fulfillmentReq.id);
        throw err;
      }

      // 3. Debit wallet
      const updatedMerchant = await tx.merchant.update({
        where: { id: merchantId },
        data: {
          walletBalance: { decrement: totalCost },
        },
      });

      // 4. Create wallet transaction record
      const walletTxn = await tx.walletTransaction.create({
        data: {
          merchantId,
          type: 'DEBIT',
          amount: totalCost,
          balanceAfter: updatedMerchant.walletBalance,
          referenceId: fulfillmentReq.id,
          fulfillmentId: fulfillmentReq.id,
        },
      });

      // 5. Confirm allocation (codes → ALLOCATED)
      await this.allocationEngine.confirmAllocation(tx, fulfillmentReq.id, allocationResults);

      // 6. Update fulfillment status
      const updatedReq = await tx.fulfillmentRequest.update({
        where: { id: fulfillmentReq.id },
        data: { status: 'ALLOCATED' },
        include: { allocations: true },
      });

      // 7. Generate delivery token
      const rawToken = this.encryptionService.generateToken(32);
      const tokenHash = this.encryptionService.hashToken(rawToken);
      const tokenExpiryHours = this.configService.get<number>('DELIVERY_TOKEN_EXPIRY_HOURS', 168);

      await tx.deliveryToken.create({
        data: {
          fulfillmentId: fulfillmentReq.id,
          tokenHash,
          expiresAt: new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000),
        },
      });

      return {
        fulfillmentReq: updatedReq,
        allocationResults,
        walletBalanceAfter: updatedMerchant.walletBalance,
        deliveryToken: rawToken,
      };
    });

    // Audit log
    await this.auditService.log({
      actorType: actorType || 'SYSTEM',
      actorId: actorId || merchantId,
      action: 'fulfillment.allocated',
      entity: 'FulfillmentRequest',
      entityId: result.fulfillmentReq.id,
      metadata: {
        productId,
        amount,
        allocation: combination.map((c) => `$${c.faceValue} x${c.count}`),
        walletBalanceAfter: result.walletBalanceAfter,
      },
      ip,
    });

    // Fire webhook
    this.webhookService.queueWebhookEvent(merchantId, 'fulfillment.allocated', {
      fulfillment_id: result.fulfillmentReq.id,
      reference_id: referenceId,
      allocation: combination.map((c) => `$${c.faceValue} x${c.count}`),
    }).catch(() => {});

    // Format response
    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
    const deliveryLink = `${baseUrl}/api/v1/d/${result.deliveryToken}`;

    return {
      fulfillment_id: result.fulfillmentReq.id,
      status: 'ALLOCATED' as const,
      allocation: combination.map((c) => `$${c.faceValue}`),
      delivery_link: deliveryLink,
      wallet_balance_after: result.walletBalanceAfter,
    };
  }

  async getFulfillmentStatus(fulfillmentId: string, merchantId: string) {
    const req = await this.prisma.fulfillmentRequest.findFirst({
      where: { id: fulfillmentId, merchantId },
      include: {
        allocations: true,
        deliveryToken: true,
      },
    });

    if (!req) {
      throw new NotFoundException({
        error: 'NOT_FOUND',
        code: 'FULFILLMENT_NOT_FOUND',
        message: 'Fulfillment request not found',
      });
    }

    return this.formatFulfillmentResponse(req);
  }

  async getDeliveryLink(fulfillmentId: string, merchantId: string) {
    const req = await this.prisma.fulfillmentRequest.findFirst({
      where: { id: fulfillmentId, merchantId },
      include: { deliveryToken: true },
    });

    if (!req) {
      throw new NotFoundException({
        error: 'NOT_FOUND',
        code: 'FULFILLMENT_NOT_FOUND',
        message: 'Fulfillment request not found',
      });
    }

    if (req.status !== 'ALLOCATED' && req.status !== 'DELIVERED') {
      throw new BadRequestException({
        error: 'NOT_READY',
        code: 'NOT_ALLOCATED',
        message: 'Fulfillment has not been allocated yet',
      });
    }

    if (!req.deliveryToken) {
      throw new NotFoundException({
        error: 'NOT_FOUND',
        code: 'NO_DELIVERY_TOKEN',
        message: 'Delivery token not found',
      });
    }

    return {
      fulfillment_id: req.id,
      status: req.status,
      has_delivery_token: !!req.deliveryToken,
      delivery_expires_at: req.deliveryToken?.expiresAt || null,
      revealed_at: req.deliveryToken?.revealedAt || null,
      is_revealed: !!req.deliveryToken?.revealedAt,
    };
  }

  async getOrderStatus(referenceId: string, merchantId: string) {
    const req = await this.prisma.fulfillmentRequest.findFirst({
      where: { referenceId, merchantId },
      include: { deliveryToken: true },
    });

    if (!req) {
      throw new NotFoundException({
        error: 'NOT_FOUND',
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    return {
      fulfillment_id: req.id,
      reference_id: req.referenceId,
      status: req.status,
      created_at: req.createdAt,
      revealed: req.deliveryToken?.revealedAt ? true : false,
      revealed_at: req.deliveryToken?.revealedAt || null,
    };
  }

  async reverseFulfillment(fulfillmentId: string, adminId: string, ip?: string) {
    const req = await this.prisma.fulfillmentRequest.findUnique({
      where: { id: fulfillmentId },
      include: { walletTxn: true, allocations: true },
    });

    if (!req) {
      throw new NotFoundException('Fulfillment request not found');
    }

    if (req.status === 'DELIVERED') {
      throw new BadRequestException({
        error: 'CANNOT_REVERSE',
        code: 'ALREADY_DELIVERED',
        message: 'Cannot reverse a fulfillment that has already been delivered to the customer',
      });
    }

    if (req.status === 'REVERSED') {
      throw new ConflictException('Fulfillment already reversed');
      }

    const refundAmount = req.walletTxn ? req.walletTxn.amount : 0;

    const result = await this.prisma.$transaction(async (tx) => {
      // Release codes back to AVAILABLE
      await this.allocationEngine.reverseAllocation(tx, fulfillmentId);

      // Credit wallet back
      const updatedMerchant = await tx.merchant.update({
        where: { id: req.merchantId },
        data: { walletBalance: { increment: refundAmount } },
      });

      // Create refund wallet transaction
      await tx.walletTransaction.create({
        data: {
          merchantId: req.merchantId,
          type: 'REFUND',
          amount: refundAmount,
          balanceAfter: updatedMerchant.walletBalance,
          referenceId: fulfillmentId,
          fulfillmentId: fulfillmentId,
        },
      });

      // Update fulfillment status
      const updatedReq = await tx.fulfillmentRequest.update({
        where: { id: fulfillmentId },
        data: { status: 'REVERSED' },
      });

      return updatedReq;
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'fulfillment.reversed',
      entity: 'FulfillmentRequest',
      entityId: fulfillmentId,
      metadata: { refundAmount, merchantId: req.merchantId },
      ip,
    });

    this.webhookService.queueWebhookEvent(req.merchantId, 'fulfillment.reversed', {
      fulfillment_id: fulfillmentId,
      reference_id: req.referenceId,
      refund_amount: refundAmount,
    }).catch(() => {});

    return { success: true, fulfillment_id: fulfillmentId, status: 'REVERSED' };
  }

  private formatFulfillmentResponse(req: any) {
    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');

    return {
      fulfillment_id: req.id,
      status: req.status,
      reference_id: req.referenceId,
      created_at: req.createdAt,
      allocation: req.allocations?.[0]?.codeItemIds
        ? [`${JSON.parse(req.allocations[0].codeItemIds || '[]').length} codes`]
        : [],
      revealed: req.deliveryToken?.revealedAt ? true : false,
    };
  }

  /**
   * Background job: sweep expired reservations
   */
  async sweepExpiredReservations() {
    const result = await this.prisma.$transaction(async (tx) => {
      const expired = await tx.codeItem.findMany({
        where: {
          status: 'RESERVED',
          reservedUntil: { lt: new Date() },
        },
        select: { id: true, reservedByReqId: true },
      });

      if (expired.length === 0) return { count: 0 };

      const codeItemIds = expired.map((c) => c.id);
      const reqIds = [...new Set(expired.map((c) => c.reservedByReqId).filter(Boolean))];

      // Release codes
      await tx.codeItem.updateMany({
        where: { id: { in: codeItemIds } },
        data: {
          status: 'AVAILABLE',
          reservedUntil: null,
          reservedByReqId: null,
        },
      });

      // Mark fulfillment requests as FAILED
      for (const reqId of reqIds) {
        await tx.fulfillmentRequest.updateMany({
          where: { id: reqId!, status: 'PENDING' },
          data: { status: 'FAILED', failureReason: 'Reservation expired' },
        });
      }

      return { count: expired.length };
    });

    if (result.count > 0) {
      this.logger.log(`Swept ${result.count} expired reservations`);
    }

    return result;
  }
}
