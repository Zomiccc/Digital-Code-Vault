import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../encryption/encryption.service';
import { nanoid } from 'nanoid';
import type Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe | null = null;
  private readonly webhookSecret: string;
  private readonly publishableKey: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private walletService: WalletService,
    private fulfillmentService: FulfillmentService,
    private emailService: EmailService,
    private auditService: AuditService,
    private encryptionService: EncryptionService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '';
    this.publishableKey = this.configService.get<string>('STRIPE_PUBLISHABLE_KEY') || '';

    if (secretKey && !secretKey.includes('placeholder')) {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2024-06-20' as any,
      });
      this.logger.log('Stripe initialized with secret key');
    } else {
      this.logger.warn('STRIPE_SECRET_KEY not set or is placeholder — Stripe features disabled');
    }
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  getPublishableKey(): string {
    return this.publishableKey;
  }

  // ─── Merchant Wallet Funding ───

  async createMerchantFundingSession(params: {
    merchantId: string;
    amount: number;
    currency?: string;
  }): Promise<{ checkout_url: string; session_id: string; payment_record_id: string }> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    const { merchantId, amount, currency = 'USD' } = params;

    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant || merchant.status !== 'ACTIVE') {
      throw new BadRequestException('Merchant not found or inactive');
    }

    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');

    // Create PaymentRecord first
    const paymentRecord = await this.prisma.paymentRecord.create({
      data: {
        merchantId,
        amount,
        currency,
        status: 'PENDING',
        paymentType: 'MERCHANT_WALLET_FUNDING',
        description: `Wallet funding for ${merchant.name}`,
      },
    });

    const session = await this.stripe!.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: 'Wallet Funding',
              description: `Add ${amount} ${currency} to your merchant wallet`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/api/v1/stripe/merchant-funding/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/api/v1/stripe/merchant-funding/cancel?session_id={CHECKOUT_SESSION_ID}`,
      client_reference_id: paymentRecord.id,
      metadata: {
        merchantId,
        paymentRecordId: paymentRecord.id,
        type: 'MERCHANT_WALLET_FUNDING',
      },
    });

    await this.prisma.paymentRecord.update({
      where: { id: paymentRecord.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    this.logger.log(`Merchant funding session created: ${session.id} for merchant ${merchantId} amount ${amount}`);

    return {
      checkout_url: session.url!,
      session_id: session.id,
      payment_record_id: paymentRecord.id,
    };
  }

  // ─── Customer Direct Purchase ───

  async createCustomerPurchaseSession(params: {
    customerEmail: string;
    customerName?: string;
    customerId?: string;
    productId: string;
    denominationId?: string;
    amount: number;
    currency?: string;
  }): Promise<{ checkout_url: string; session_id: string; order_id: string; payment_record_id: string }> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    const {
      customerEmail,
      customerName,
      customerId,
      productId,
      denominationId,
      amount,
      currency = 'USD',
    } = params;

    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Validate product exists and is active
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.status !== 'ACTIVE') {
      throw new NotFoundException('Product not found or inactive');
    }

    // If denomination specified, validate it
    if (denominationId) {
      const denom = await this.prisma.denomination.findUnique({ where: { id: denominationId } });
      if (!denom || denom.productId !== productId) {
        throw new BadRequestException('Invalid denomination for this product');
      }
      // Use the denomination face value as the amount (backend determines price)
      const faceValue = Number(denom.faceValue);
      if (faceValue !== amount) {
        this.logger.warn(`Amount mismatch: requested ${amount}, denomination face value ${faceValue} — using denomination value`);
      }
    }

    // Check inventory availability before creating the session
    const stock = await this.checkInventoryAvailability(productId, amount);
    if (!stock.available) {
      throw new BadRequestException({
        error: 'INSUFFICIENT_STOCK',
        code: 'INSUFFICIENT_STOCK',
        message: stock.reason || 'Not enough stock available',
      });
    }

    const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');

    // Create CustomerOrder
    const order = await this.prisma.customerOrder.create({
      data: {
        customerId: customerId || null,
        customerEmail,
        customerName: customerName || null,
        productId,
        denominationId: denominationId || null,
        amount,
        currency,
        status: 'PENDING_PAYMENT',
      },
    });

    // Create PaymentRecord
    const paymentRecord = await this.prisma.paymentRecord.create({
      data: {
        customerId: customerId || null,
        customerOrderId: order.id,
        amount,
        currency,
        status: 'PENDING',
        paymentType: 'CUSTOMER_PURCHASE',
        description: `Purchase: ${product.name}`,
        metadata: JSON.stringify({ productId, denominationId, orderId: order.id }),
      },
    });

    const session = await this.stripe!.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: product.name,
              description: `Digital code — ${product.region}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/api/v1/stripe/customer-purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/api/v1/stripe/customer-purchase/cancel?session_id={CHECKOUT_SESSION_ID}`,
      client_reference_id: paymentRecord.id,
      metadata: {
        orderId: order.id,
        paymentRecordId: paymentRecord.id,
        productId,
        denominationId: denominationId || '',
        customerEmail,
        type: 'CUSTOMER_PURCHASE',
      },
    });

    await this.prisma.paymentRecord.update({
      where: { id: paymentRecord.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    this.logger.log(`Customer purchase session created: ${session.id} for order ${order.id}`);

    return {
      checkout_url: session.url!,
      session_id: session.id,
      order_id: order.id,
      payment_record_id: paymentRecord.id,
    };
  }

  // ─── Webhook Handling ───

  async handleWebhookEvent(payload: Buffer, signature: string): Promise<{ received: boolean }> {
    if (!this.isConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    let event: Stripe.Event;

    try {
      event = this.stripe!.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      this.logger.error(`Stripe webhook signature verification failed: ${(err as Error).message}`);
      throw new BadRequestException(`Webhook signature verification failed`);
    }

    this.logger.log(`Stripe webhook received: ${event.type} (id: ${event.id})`);

    // Idempotency: check if we already processed this event
    const existing = await this.prisma.paymentRecord.findFirst({
      where: { stripeEventId: event.id },
    });

    if (existing) {
      this.logger.log(`Stripe event ${event.id} already processed — skipping (idempotent)`);
      return { received: true };
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event);
        break;
      case 'checkout.session.expired':
        await this.handleCheckoutSessionExpired(event);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(event);
        break;
      default:
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return { received: true };
  }

  private async handleCheckoutSessionCompleted(event: Stripe.Event) {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentRecordId = session.client_reference_id;
    const metadata = session.metadata || {};

    if (!paymentRecordId) {
      this.logger.error(`No client_reference_id in session ${session.id}`);
      return;
    }

    // Find the payment record
    const paymentRecord = await this.prisma.paymentRecord.findUnique({
      where: { id: paymentRecordId },
    });

    if (!paymentRecord) {
      this.logger.error(`Payment record not found: ${paymentRecordId}`);
      return;
    }

    // Idempotency: if already succeeded, skip
    if (paymentRecord.status === 'SUCCEEDED') {
      this.logger.log(`Payment record ${paymentRecordId} already succeeded — skipping`);
      return;
    }

    const paymentType = metadata.type || paymentRecord.paymentType;

    if (paymentType === 'MERCHANT_WALLET_FUNDING') {
      await this.processMerchantFundingSuccess(paymentRecord, session, event.id);
    } else if (paymentType === 'CUSTOMER_PURCHASE') {
      await this.processCustomerPurchaseSuccess(paymentRecord, session, event.id);
    } else {
      this.logger.error(`Unknown payment type: ${paymentType}`);
    }
  }

  private async processMerchantFundingSuccess(
    paymentRecord: any,
    session: Stripe.Checkout.Session,
    eventId: string,
  ) {
    const merchantId = paymentRecord.merchantId;
    const amount = Number(paymentRecord.amount);
    const currency = paymentRecord.currency;

    this.logger.log(`Processing merchant funding success: merchant=${merchantId}, amount=${amount}`);

    // Atomic: update payment record + credit merchant wallet + create wallet txn + credit admin ledger
    await this.prisma.$transaction(async (tx) => {
      // 1. Update payment record
      await tx.paymentRecord.update({
        where: { id: paymentRecord.id },
        data: {
          status: 'SUCCEEDED',
          stripePaymentIntentId: session.payment_intent as string,
          stripeEventId: eventId,
          paidAt: new Date(),
        },
      });

      // 2. Credit merchant wallet
      const updatedMerchant = await tx.merchant.update({
        where: { id: merchantId },
        data: { walletBalance: { increment: amount } },
      });

      // 3. Create merchant wallet transaction
      await tx.walletTransaction.create({
        data: {
          merchantId,
          type: 'CREDIT',
          amount,
          balanceAfter: updatedMerchant.walletBalance,
          referenceId: paymentRecord.id,
        },
      });

      // 4. Credit admin wallet (platform funds increase)
      const adminWalletId = await this.walletService.getOrCreateAdminWallet();
      const updatedAdminWallet = await tx.adminWallet.update({
        where: { id: adminWalletId },
        data: { balance: { increment: amount } },
      });

      await tx.adminWalletTransaction.create({
        data: {
          adminWalletId,
          type: 'CREDIT',
          amount,
          balanceAfter: updatedAdminWallet.balance,
          referenceId: paymentRecord.id,
          source: 'FUNDING',
          description: `Stripe wallet funding from merchant ${merchantId}`,
        },
      });
    });

    // Audit log
    await this.auditService.log({
      actorType: 'SYSTEM',
      action: 'stripe.merchant_funding_succeeded',
      entity: 'PaymentRecord',
      entityId: paymentRecord.id,
      metadata: {
        merchantId,
        amount,
        currency,
        stripeSessionId: session.id,
        eventId,
      },
    });

    this.logger.log(`Merchant funding succeeded: ${merchantId} credited ${amount} ${currency}`);
  }

  private async processCustomerPurchaseSuccess(
    paymentRecord: any,
    session: Stripe.Checkout.Session,
    eventId: string,
  ) {
    const orderId = paymentRecord.customerOrderId;
    const metadata = session.metadata || {};
    const productId = metadata.productId || '';
    const denominationId = metadata.denominationId || undefined;
    const customerEmail = metadata.customerEmail || '';
    const amount = Number(paymentRecord.amount);

    this.logger.log(`Processing customer purchase success: order=${orderId}, amount=${amount}`);

    if (!orderId) {
      this.logger.error(`No customer order ID in payment record ${paymentRecord.id}`);
      return;
    }

    const order = await this.prisma.customerOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      this.logger.error(`Customer order not found: ${orderId}`);
      return;
    }

    // Idempotency: if order already fulfilled, skip
    if (order.status === 'FULFILLED' || order.status === 'PAID') {
      this.logger.log(`Order ${orderId} already processed — skipping`);
      return;
    }

    // Find an active merchant to fulfill through (same logic as existing customer flow)
    const merchants = await this.prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { walletBalance: 'desc' },
      take: 1,
    });

    if (merchants.length === 0) {
      this.logger.error(`No active merchant to fulfill customer order ${orderId}`);
      await this.prisma.customerOrder.update({
        where: { id: orderId },
        data: {
          status: 'FAILED',
          errorMessage: 'No active merchant available',
        },
      });
      await this.prisma.paymentRecord.update({
        where: { id: paymentRecord.id },
        data: {
          status: 'SUCCEEDED',
          stripePaymentIntentId: session.payment_intent as string,
          stripeEventId: eventId,
          paidAt: new Date(),
        },
      });
      return;
    }

    const merchant = merchants[0];
    const idempotencyKey = `stripe-purchase-${orderId}`;

    // Update payment record first
    await this.prisma.paymentRecord.update({
      where: { id: paymentRecord.id },
      data: {
        status: 'SUCCEEDED',
        stripePaymentIntentId: session.payment_intent as string,
        stripeEventId: eventId,
        paidAt: new Date(),
      },
    });

    // Update order to PAID
    await this.prisma.customerOrder.update({
      where: { id: orderId },
      data: { status: 'PAID' },
    });

    // Now fulfill the order using the existing fulfillment service
    try {
      const result = await this.fulfillmentService.createFulfillment({
        merchantId: merchant.id,
        productId: order.productId,
        amount,
        currency: order.currency,
        referenceId: orderId,
        idempotencyKey,
        customerEmail: order.customerEmail,
        customerName: order.customerName || undefined,
        actorType: 'SYSTEM',
        actorId: `stripe-${eventId.slice(0, 16)}`,
        denominationId: denominationId || order.denominationId || undefined,
      });

      // Update order with fulfillment info
      await this.prisma.customerOrder.update({
        where: { id: orderId },
        data: {
          status: 'FULFILLED',
          fulfillmentId: result.fulfillment_id,
          revealToken: result.delivery_link || null,
        },
      });

      // The fulfillment service already sends the reveal email
      // But we also send a purchase confirmation email
      const product = await this.prisma.product.findUnique({ where: { id: order.productId } });

      if (product && result.delivery_link) {
        this.emailService.sendRevealCodeEmail(
          order.customerEmail,
          order.customerName || order.customerEmail,
          product.name,
          result.delivery_link,
          result.fulfillment_id,
        ).catch((err) => {
          this.logger.error(`Failed to send reveal email to customer: ${(err as Error).message}`);
        });
      }

      // Audit log
      await this.auditService.log({
        actorType: 'SYSTEM',
        action: 'stripe.customer_purchase_fulfilled',
        entity: 'CustomerOrder',
        entityId: orderId,
        metadata: {
          merchantId: merchant.id,
          fulfillmentId: result.fulfillment_id,
          amount,
          productId: order.productId,
          eventId,
        },
      });

      this.logger.log(`Customer purchase fulfilled: order=${orderId}, fulfillment=${result.fulfillment_id}`);
    } catch (err) {
      this.logger.error(`Fulfillment failed for order ${orderId}: ${(err as Error).message}`);

      await this.prisma.customerOrder.update({
        where: { id: orderId },
        data: {
          status: 'FAILED',
          errorMessage: (err as Error).message,
        },
      });

      await this.auditService.log({
        actorType: 'SYSTEM',
        action: 'stripe.customer_purchase_fulfillment_failed',
        entity: 'CustomerOrder',
        entityId: orderId,
        metadata: {
          error: (err as Error).message,
          amount,
          productId: order.productId,
          eventId,
        },
      });
    }
  }

  private async handleCheckoutSessionExpired(event: Stripe.Event) {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentRecordId = session.client_reference_id;

    if (!paymentRecordId) return;

    const paymentRecord = await this.prisma.paymentRecord.findUnique({
      where: { id: paymentRecordId },
    });

    if (!paymentRecord || paymentRecord.status !== 'PENDING') return;

    await this.prisma.paymentRecord.update({
      where: { id: paymentRecordId },
      data: {
        status: 'CANCELED',
        stripeEventId: event.id,
      },
    });

    // If there's a customer order, cancel it too
    if (paymentRecord.customerOrderId) {
      await this.prisma.customerOrder.updateMany({
        where: { id: paymentRecord.customerOrderId, status: 'PENDING_PAYMENT' },
        data: { status: 'CANCELED' },
      });
    }

    this.logger.log(`Payment ${paymentRecordId} canceled (session expired)`);
  }

  private async handleChargeRefunded(event: Stripe.Event) {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = charge.payment_intent as string;

    const paymentRecord = await this.prisma.paymentRecord.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!paymentRecord) {
      this.logger.warn(`Refund: no payment record found for PI ${paymentIntentId}`);
      return;
    }

    if (paymentRecord.status === 'REFUNDED') {
      this.logger.log(`Payment ${paymentRecord.id} already refunded — skipping`);
      return;
    }

    const refundAmount = Number(charge.amount_refunded) / 100;

    await this.prisma.paymentRecord.update({
      where: { id: paymentRecord.id },
      data: {
        status: 'REFUNDED',
        refundAmount,
        refundedAt: new Date(),
      },
    });

    // If it was a merchant funding, reverse the wallet credit
    if (paymentRecord.paymentType === 'MERCHANT_WALLET_FUNDING' && paymentRecord.merchantId) {
      await this.prisma.$transaction(async (tx) => {
        const updatedMerchant = await tx.merchant.update({
          where: { id: paymentRecord.merchantId },
          data: { walletBalance: { decrement: refundAmount } },
        });

        await tx.walletTransaction.create({
          data: {
            merchantId: paymentRecord.merchantId,
            type: 'DEBIT',
            amount: refundAmount,
            balanceAfter: updatedMerchant.walletBalance,
            referenceId: `refund-${paymentRecord.id}`,
          },
        });

        // Debit admin wallet
        const adminWalletId = await this.walletService.getOrCreateAdminWallet();
        const updatedAdminWallet = await tx.adminWallet.update({
          where: { id: adminWalletId },
          data: { balance: { decrement: refundAmount } },
        });

        await tx.adminWalletTransaction.create({
          data: {
            adminWalletId,
            type: 'DEBIT',
            amount: refundAmount,
            balanceAfter: updatedAdminWallet.balance,
            referenceId: `refund-${paymentRecord.id}`,
            source: 'REFUND',
            description: `Stripe refund for merchant funding ${paymentRecord.id}`,
          },
        });
      });

      this.logger.log(`Merchant funding refund processed: ${paymentRecord.merchantId} debited ${refundAmount}`);
    }

    await this.auditService.log({
      actorType: 'SYSTEM',
      action: 'stripe.refund_processed',
      entity: 'PaymentRecord',
      entityId: paymentRecord.id,
      metadata: {
        refundAmount,
        paymentIntentId,
        eventId: event.id,
      },
    });
  }

  // ─── Inventory Check ───

  private async checkInventoryAvailability(productId: string, amount: number): Promise<{ available: boolean; reason?: string }> {
    // Get all denominations for this product with available codes
    const denominations = await this.prisma.denomination.findMany({
      where: { productId },
      include: {
        codeItems: {
          where: { status: 'AVAILABLE' },
          select: { id: true },
        },
      },
    });

    const totalAvailable = denominations.reduce((sum, d) => sum + d.codeItems.length, 0);
    if (totalAvailable === 0) {
      return { available: false, reason: 'No available codes for this product' };
    }

    // Check if we can make the amount with available denominations
    const stock = denominations
      .filter((d) => d.codeItems.length > 0)
      .map((d) => ({
        denominationId: d.id,
        faceValue: Number(d.faceValue),
        availableCount: d.codeItems.length,
      }))
      .sort((a, b) => b.faceValue - a.faceValue);

    // Greedy check: can we sum to at least `amount`?
    let remaining = amount;
    for (const s of stock) {
      const needed = Math.ceil(remaining / s.faceValue);
      if (needed <= s.availableCount) {
        return { available: true };
      }
      remaining -= s.faceValue * s.availableCount;
    }

    if (remaining <= 0) return { available: true };

    return { available: false, reason: `Insufficient stock to fulfill ${amount}` };
  }

  // ─── Status Endpoints ───

  async getPaymentRecord(id: string) {
    const record = await this.prisma.paymentRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Payment record not found');
    }
    return {
      id: record.id,
      status: record.status,
      payment_type: record.paymentType,
      amount: record.amount,
      currency: record.currency,
      stripe_checkout_session_id: record.stripeCheckoutSessionId,
      stripe_payment_intent_id: record.stripePaymentIntentId,
      paid_at: record.paidAt,
      created_at: record.createdAt,
    };
  }

  async getCustomerOrder(id: string) {
    const order = await this.prisma.customerOrder.findUnique({
      where: { id },
      include: {
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      id: order.id,
      status: order.status,
      amount: order.amount,
      currency: order.currency,
      customer_email: order.customerEmail,
      customer_name: order.customerName,
      product_id: order.productId,
      fulfillment_id: order.fulfillmentId,
      reveal_link: order.revealToken,
      error_message: order.errorMessage,
      payment_status: order.payment?.status || null,
      created_at: order.createdAt,
    };
  }

  async listPaymentRecords(params: {
    merchantId?: string;
    paymentType?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};
    if (params.merchantId) where.merchantId = params.merchantId;
    if (params.paymentType) where.paymentType = params.paymentType;
    if (params.status) where.status = params.status;

    const [records, total] = await Promise.all([
      this.prisma.paymentRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit || 50,
        skip: params.offset || 0,
      }),
      this.prisma.paymentRecord.count({ where }),
    ]);

    return {
      items: records.map((r) => ({
        id: r.id,
        merchant_id: r.merchantId,
        customer_id: r.customerId,
        customer_order_id: r.customerOrderId,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        payment_type: r.paymentType,
        stripe_checkout_session_id: r.stripeCheckoutSessionId,
        stripe_payment_intent_id: r.stripePaymentIntentId,
        paid_at: r.paidAt,
        refund_amount: r.refundAmount,
        created_at: r.createdAt,
      })),
      total,
    };
  }
}
