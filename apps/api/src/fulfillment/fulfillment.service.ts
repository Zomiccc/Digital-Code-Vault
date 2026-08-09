import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { AllocationEngineService, AllocationResult } from './allocation-engine.service';
import { WebhookService } from '../webhooks/webhook.service';
import { EmailService } from '../email/email.service';
@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private auditService: AuditService,
    private allocationEngine: AllocationEngineService,
    @Inject(forwardRef(() => WebhookService)) private webhookService: WebhookService,
    private emailService: EmailService,
  ) {}

  async createFulfillment(params: {
    merchantId: string;
    productId: string;
    amount: number;
    currency: string;
    referenceId?: string;
    idempotencyKey: string;
    sandbox?: boolean;
    customerEmail?: string;
    customerName?: string;
    customerAddress?: string;
    actorId?: string;
    actorType?: 'ADMIN' | 'MERCHANT' | 'SYSTEM';
    ip?: string;
  }) {
    const { merchantId, productId, amount, currency, referenceId, idempotencyKey, sandbox, customerEmail, customerName, customerAddress, actorId, actorType, ip } = params;

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
      const response = this.formatFulfillmentResponse(existing);
      // Try to restore delivery link from idempotency record
      const idempotencyRecord = await this.prisma.idempotencyRecord.findUnique({
        where: { key: `${merchantId}:${idempotencyKey}` },
      });
      if (idempotencyRecord) {
        return JSON.parse(idempotencyRecord.responseBody);
      }
      return response;
    }

    // Check for a cached idempotency record (e.g. from a failed attempt)
    const cachedRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { key: `${merchantId}:${idempotencyKey}` },
    });
    if (cachedRecord) {
      return JSON.parse(cachedRecord.responseBody);
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

    // ─── Send order received email (before payment confirmation) ───
    if (customerEmail) {
      const orderDate = new Date().toLocaleString('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      const totalPayment = `$${amount.toFixed(2)} ${currency}`;

      this.emailService.sendOrderReceivedEmail(
        customerEmail,
        customerName || customerEmail,
        referenceId || idempotencyKey.slice(0, 12),
        orderDate,
        product.name,
        totalPayment,
        ['Bank Transfer', 'EasyPaisa', 'NayaPay', 'JazzCash'],
        [
          { bank: 'Bank Alfalah', accountNumber: '03031007274922', iban: 'PK03ALFH0303001007274922' },
          { bank: 'Meezan Bank', accountNumber: '01370104307608', iban: 'PK48MEZN0001370104307608' },
        ],
        { title: 'Ammar Ajaz', number: '0306-7666422' },
      ).catch((err) => {
        this.logger.error(`Failed to send order received email: ${(err as Error).message}`);
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
    let totalCost = combination.reduce((acc, c) => acc + c.faceValue * c.count, 0);

    // Sandbox mode: skip wallet balance check and debit
    if (!sandbox) {
      // Check wallet balance
      if (Number(merchant.walletBalance) < totalCost) {
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
    }

    const reservationTtl = this.configService.get<number>('RESERVATION_TTL_MINUTES', 15);

    // Execute everything in a transaction with retry for stock conflicts
    const MAX_RETRIES = 3;
    let result: any;
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Re-fetch stock on retries (combination may have changed)
        if (attempt > 1) {
          this.logger.log(`[Fulfillment] Retry attempt ${attempt}/${MAX_RETRIES} for ${idempotencyKey}`);
          const retryStock = await this.allocationEngine.getAvailableStock(this.prisma, productId);
          const retryDenoms = retryStock.filter((s) => s.availableCount > 0);
          if (retryDenoms.length === 0) {
            throw new BadRequestException({
              error: 'INSUFFICIENT_STOCK',
              code: 'INSUFFICIENT_STOCK',
              message: 'No available stock for this product after retry',
            });
          }
          const retryCombo = this.allocationEngine.findBestCombination(retryDenoms, amount);
          if (!retryCombo) {
            throw new BadRequestException({
              error: 'INSUFFICIENT_STOCK',
              code: 'INSUFFICIENT_STOCK',
              message: `No denomination combination sums to ${amount} after retry`,
            });
          }
          combination.length = 0;
          combination.push(...retryCombo);
          totalCost = combination.reduce((acc, c) => acc + c.faceValue * c.count, 0);
        }

        result = await this.prisma.$transaction(async (tx) => {
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
              customerEmail: customerEmail || null,
              customerName: customerName || null,
              customerAddress: customerAddress || null,
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

          // 3. Debit wallet (skip in sandbox mode)
          let updatedMerchant: any;
          if (sandbox) {
            updatedMerchant = await tx.merchant.findUnique({ where: { id: merchantId } });
          } else {
            updatedMerchant = await tx.merchant.update({
              where: { id: merchantId },
              data: {
                walletBalance: { decrement: totalCost },
              },
            });

            // 4. Create wallet transaction record
            await tx.walletTransaction.create({
              data: {
                merchantId,
                type: 'DEBIT',
                amount: totalCost,
                balanceAfter: updatedMerchant.walletBalance,
                referenceId: fulfillmentReq.id,
                fulfillmentId: fulfillmentReq.id,
              },
            });
          }

          // 5. Confirm allocation (codes → ALLOCATED)
          await this.allocationEngine.confirmAllocation(tx, fulfillmentReq.id, allocationResults);

          // 6. Update fulfillment status
          const updatedReq = await tx.fulfillmentRequest.update({
            where: { id: fulfillmentReq.id },
            data: { status: 'ALLOCATED' },
            include: { allocations: true },
          });

          // 7. Generate permanent delivery token (no expiry — link is permanently accessible)
          const rawToken = this.encryptionService.generateToken(32);
          const tokenHash = this.encryptionService.hashToken(rawToken);

          await tx.deliveryToken.create({
            data: {
              fulfillmentId: fulfillmentReq.id,
              tokenHash,
            },
          });

          return {
            fulfillmentReq: updatedReq,
            allocationResults,
            walletBalanceAfter: updatedMerchant.walletBalance,
            deliveryToken: rawToken,
          };
        }, { timeout: 30000 });

        break; // Success — exit retry loop
      } catch (err: any) {
        lastError = err;
        const isStockConflict = err?.response?.code === 'STOCK_CONFLICT' ||
          err?.response?.code === 'INSUFFICIENT_STOCK' ||
          err?.message?.includes('Transaction already closed');
        if (isStockConflict && attempt < MAX_RETRIES) {
          this.logger.warn(`[Fulfillment] Stock conflict on attempt ${attempt}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          continue;
        }
        throw err;
      }
    }

    if (!result) {
      throw lastError || new Error('Fulfillment failed after retries');
    }

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
    const deliveryLink = `${baseUrl}/api/v1/reveal/${result.deliveryToken}`;

    // Send emails after successful payment/allocation confirmation.
    // Both emails are sent asynchronously and independently — if one fails,
    // the other will still be sent.
    const purchaseDate = result.fulfillmentReq.createdAt.toISOString();

    if (customerEmail) {
      // Send reveal code email to customer
      const recipientName = customerName || customerEmail;
      this.emailService.sendRevealCodeEmail(
        customerEmail,
        recipientName,
        product.name,
        deliveryLink,
        result.fulfillmentReq.id,
      ).catch((err) => {
        this.logger.error(`Failed to send reveal code email to customer: ${(err as Error).message}`);
      });

      // Send payment confirmation email with PDF invoice to customer
      const quantity = combination.reduce((acc, c) => acc + c.count, 0);
      const price = amount / quantity;
      const subtotal = amount;
      const tax = 0; // No tax for now
      const total = amount;

      // Generate PDF invoice
      this.emailService.generateInvoice({
        invoiceNumber: result.fulfillmentReq.id,
        customerName: customerName || customerEmail,
        customerEmail: customerEmail,
        merchantName: merchant.name,
        merchantAddress: merchant.address || undefined,
        product: product.name,
        quantity,
        price,
        subtotal,
        tax,
        total,
        paymentMethod: 'Bank Transfer',
        date: new Date().toLocaleDateString(),
        billingAddress: customerAddress || undefined,
      }).then((invoiceBuffer) => {
        // Send payment confirmation email with invoice attached
        return this.emailService.sendPaymentConfirmationEmail(
          customerEmail,
          recipientName,
          result.fulfillmentReq.id,
          purchaseDate,
          product.name,
          quantity,
          price,
          subtotal,
          tax,
          total,
          'Bank Transfer',
          customerAddress,
          invoiceBuffer,
        );
      }).catch((err) => {
        this.logger.error(`Failed to send payment confirmation email: ${(err as Error).message}`);
      });

      // Send purchase notification email to merchant
      this.emailService.sendMerchantPurchaseNotification(
        merchant.email,
        merchant.name,
        customerName || customerEmail,
        customerEmail,
        product.name,
        result.fulfillmentReq.id,
        purchaseDate,
        'ALLOCATED',
        product.region,
      ).catch((err) => {
        this.logger.error(`Failed to send merchant purchase notification: ${(err as Error).message}`);
      });
    } else if (merchant && product) {
      // Fallback: send delivery link to merchant (backward compatibility)
      this.emailService.sendDeliveryLinkEmail(
        merchant.email,
        merchant.name,
        product.name,
        deliveryLink,
        result.fulfillmentReq.id,
      ).catch((err) => {
        this.logger.error(`Failed to send delivery link email: ${(err as Error).message}`);
      });
    }

    const response = {
      fulfillment_id: result.fulfillmentReq.id,
      status: 'ALLOCATED' as const,
      allocation: combination.map((c) => `$${c.faceValue}`),
      delivery_link: deliveryLink,
      wallet_balance_after: result.walletBalanceAfter,
    };

    // Store idempotency record
    const idempotencyTtl = this.configService.get<number>('IDEMPOTENCY_KEY_TTL_HOURS', 24);
    await this.prisma.idempotencyRecord.create({
      data: {
        key: `${merchantId}:${idempotencyKey}`,
        merchantId,
        requestBodyHash: '',
        responseStatus: 200,
        responseBody: JSON.stringify(response),
        expiresAt: new Date(Date.now() + idempotencyTtl * 60 * 60 * 1000),
      },
    }).catch(() => {});

    return response;
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
   * Auto-fulfill pending supplier requests when new codes become available.
   * Called after bulk upload. Merchant never sees the codes — only the delivery link.
   */
  async fulfillPendingSupplierRequests(productId?: string, denominationId?: string) {
    const where: any = { status: 'PENDING_SUPPLIER' };
    if (productId) where.productId = productId;

    const pending = await this.prisma.fulfillmentRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const results: { id: string; success: boolean; reason?: string }[] = [];

    for (const req of pending) {
      try {
        const stock = await this.allocationEngine.getAvailableStock(this.prisma, req.productId);
        const availableDenominations = stock.filter((s) => s.availableCount > 0);

        if (availableDenominations.length === 0) {
          results.push({ id: req.id, success: false, reason: 'Still no stock' });
          continue;
        }

        const combination = this.allocationEngine.findBestCombination(availableDenominations, Number(req.amount));
        if (!combination) {
          results.push({ id: req.id, success: false, reason: 'No matching denomination combination' });
          continue;
        }

        const totalCost = combination.reduce((acc, c) => acc + c.faceValue * c.count, 0);
        const reservationTtl = this.configService.get<number>('RESERVATION_TTL_MINUTES', 15);

        const result = await this.prisma.$transaction(async (tx) => {
          let allocationResults: AllocationResult[];
          try {
            allocationResults = await this.allocationEngine.reserveCodes(
              tx,
              req.id,
              combination,
              reservationTtl,
            );
          } catch (err) {
            await this.allocationEngine.releaseReservation(tx, req.id);
            throw err;
          }

          // Debit wallet
          const updatedMerchant = await tx.merchant.update({
            where: { id: req.merchantId },
            data: { walletBalance: { decrement: totalCost } },
          });

          await tx.walletTransaction.create({
            data: {
              merchantId: req.merchantId,
              type: 'DEBIT',
              amount: totalCost,
              balanceAfter: updatedMerchant.walletBalance,
              referenceId: req.id,
              fulfillmentId: req.id,
            },
          });

          await this.allocationEngine.confirmAllocation(tx, req.id, allocationResults);

          const updatedReq = await tx.fulfillmentRequest.update({
            where: { id: req.id },
            data: { status: 'ALLOCATED' },
            include: { allocations: true },
          });

          // Generate permanent delivery token (no expiry)
          const rawToken = this.encryptionService.generateToken(32);
          const tokenHash = this.encryptionService.hashToken(rawToken);

          await tx.deliveryToken.create({
            data: {
              fulfillmentId: req.id,
              tokenHash,
            },
          });

          return {
            fulfillmentReq: updatedReq,
            walletBalanceAfter: updatedMerchant.walletBalance,
            deliveryToken: rawToken,
          };
        });

        await this.auditService.log({
          actorType: 'SYSTEM',
          actorId: 'system',
          action: 'fulfillment.supplier_auto_allocated',
          entity: 'FulfillmentRequest',
          entityId: req.id,
          metadata: {
            productId: req.productId,
            amount: req.amount,
            allocation: combination.map((c) => `$${c.faceValue} x${c.count}`),
            walletBalanceAfter: result.walletBalanceAfter,
          },
        });

        this.webhookService.queueWebhookEvent(req.merchantId, 'fulfillment.allocated', {
          fulfillment_id: req.id,
          reference_id: req.referenceId,
          allocation: combination.map((c) => `$${c.faceValue} x${c.count}`),
        }).catch(() => {});

        results.push({ id: req.id, success: true });
      } catch (err) {
        results.push({ id: req.id, success: false, reason: (err as Error).message });
      }
    }

    if (results.length > 0) {
      this.logger.log(`Auto-fulfilled ${results.filter((r) => r.success).length}/${results.length} pending supplier requests`);
    }

    return results;
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
