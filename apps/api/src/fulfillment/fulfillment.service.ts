import { manualOrderPricing } from './manual-order-pricing';
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
import { OrderDigestService } from '../email/order-digest.service';
import { WalletService } from '../wallet/wallet.service';
import { CurrencyService } from '../currency/currency.service';
import { convertFromUsd, normaliseCurrency } from '../currency/money';
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
    private orderDigestService: OrderDigestService,
    private walletService: WalletService,
    private currencyService: CurrencyService,
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
    inventorySource?: string; // 'DCV' | 'MERCHANT' | 'AUTO' (default: 'DCV')
    denominationId?: string; // exact denomination to use (from SKU mapping)
    variantId?: string; // variant to use for FulfillmentCombination lookup
    discountAmount?: number; // ADMIN only; reduces recorded revenue, never allocation
  }) {
    const { merchantId, productId, amount, currency, referenceId, idempotencyKey, sandbox, customerEmail, customerName, customerAddress, actorId, actorType, ip } = params;
    if (params.discountAmount !== undefined && actorType !== 'ADMIN') {
      throw new BadRequestException('Manual-order discounts are only available to admins');
    }
    const pricing = actorType === 'ADMIN' ? manualOrderPricing(amount, params.discountAmount) : undefined;

    // ─── Emergency stop: pause ALL code delivery platform-wide ───
    if (actorType !== 'ADMIN') {
      const stop = await this.prisma.platformSetting.findUnique({ where: { key: 'EMERGENCY_STOP' } });
      if (stop?.value === 'true') {
        throw new BadRequestException({
          error: 'SERVICE_PAUSED',
          code: 'EMERGENCY_STOP',
          message: 'Code delivery is temporarily paused by the platform. Please try again later.',
        });
      }
    }

    const requestedSource = params.inventorySource || 'DCV';
    const exactDenominationId = params.denominationId || null;
    const variantId = params.variantId || null;

    // Validate amount — skip when denomination is explicitly mapped (amount is derived from denomination)
    if (amount <= 0 && !exactDenominationId) {
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
      // If the existing request FAILED, the idempotency cache should NOT return
      // a failure as if it were a success. Delete the failed record and its
      // idempotency cache so we can re-attempt fulfillment (e.g. after an admin
      // mapped the product or added stock).
      if (existing.status === 'FAILED') {
        this.logger.log(`[Fulfillment] Existing request ${existing.id} has FAILED status — clearing idempotency cache and re-attempting`);
        await this.prisma.idempotencyRecord.deleteMany({
          where: { key: `${merchantId}:${idempotencyKey}` },
        }).catch(() => {});
        await this.prisma.fulfillmentRequest.delete({
          where: { id: existing.id },
        }).catch(() => {});
        // Fall through to re-attempt fulfillment from scratch
      } else {
        // Return the original successful result
        const response = this.formatFulfillmentResponse(existing);
        const idempotencyRecord = await this.prisma.idempotencyRecord.findUnique({
          where: { key: `${merchantId}:${idempotencyKey}` },
        });
        if (idempotencyRecord) {
          return JSON.parse(idempotencyRecord.responseBody);
        }
        return response;
      }
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

    // NOTE: The old "Order Received — Awaiting Payment" email was removed.
    // Customers now receive ONE consolidated digest email (via OrderDigestService)
    // after fulfillment, containing every item from their session with reveal links.

    const allowedIds: string[] = JSON.parse(merchant.allowedProductIds || '[]');
    if (allowedIds.length > 0 && !allowedIds.includes(productId)) {
      throw new BadRequestException({
        error: 'FORBIDDEN',
        code: 'PRODUCT_NOT_ALLOWED',
        message: 'Merchant does not have access to this product',
      });
    }

    // ─── Determine which inventory pool to use ───
    // Try merchant-owned inventory first if source is MERCHANT or AUTO
    let useMerchantPool = requestedSource === 'MERCHANT' || requestedSource === 'AUTO';
    let merchantStock: any[] = [];
    let dcvStock: any[] = [];

    if (useMerchantPool) {
      merchantStock = (await this.allocationEngine.getAvailableStock(this.prisma, productId, merchantId))
        .filter((s) => s.availableCount > 0);
      if (merchantStock.length === 0) {
        if (requestedSource === 'MERCHANT') {
          // No merchant stock and no fallback allowed
          const failedReq = await this.prisma.fulfillmentRequest.create({
            data: {
              merchantId,
              productId,
              amount,
              currency,
              idempotencyKey,
              referenceId,
              status: 'FAILED',
              failureReason: 'No available merchant-owned stock for this product',
              sandbox: sandbox || false,
              inventorySource: 'MERCHANT',
            },
          });

          await this.auditService.log({
            actorType: actorType || 'SYSTEM',
            actorId: actorId || merchantId,
            action: 'fulfillment.failed',
            entity: 'FulfillmentRequest',
            entityId: failedReq.id,
            metadata: { reason: 'INSUFFICIENT_STOCK', productId, amount, source: 'MERCHANT' },
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
            message: 'No available merchant-owned stock for this product',
          });
        }
        // AUTO: fall back to DCV pool
        useMerchantPool = false;
      }
    }

    // Get DCV stock if needed
    if (!useMerchantPool) {
      dcvStock = (await this.allocationEngine.getAvailableStock(this.prisma, productId, null))
        .filter((s) => s.availableCount > 0);
      if (dcvStock.length === 0) {
        // Try all stock as last resort for AUTO mode
        if (requestedSource === 'AUTO') {
          dcvStock = (await this.allocationEngine.getAvailableStock(this.prisma, productId, '__ALL__'))
            .filter((s) => s.availableCount > 0);
        }
      }
      if (dcvStock.length === 0) {
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
            inventorySource: 'DCV',
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
    }

    // Select the active pool
    const activeStock = useMerchantPool ? merchantStock : dcvStock;
    const activePoolMerchantId = useMerchantPool ? merchantId : null;

    // Find codes to deliver based on product type.
    // NORMAL: exact denomination mapping only — one matching code allocated from the pool.
    // ESSENTIALS: a reusable, admin-configured denomination+quantity delivery RULE
    //             (e.g. "$10 x1 + $20 x1"). The admin never selects individual codes —
    //             ANY available code matching each required denomination is selected
    //             automatically at fulfillment time, exactly like NORMAL products.
    let combination: { denominationId: string; faceValue: number; count: number }[] | null = null;
    // True when the allocation came from an admin-preset variant bundle
    // (FulfillmentCombination). Preset bundles are fixed sets of pre-selected
    // codes — the customer pays the variant price, so no face-value sum math.
    let usedVariantPreset = false;

    const productType = product.productType || 'NORMAL';
    this.logger.log(`[Fulfillment] Product "${product.name}" type: ${productType}, amount: ${amount}`);

    // ─── Variant preset bundles (highest priority) ───
    // If the order targets a specific variant (e.g. "PS Essential 1 Month"), use the
    // admin-configured FulfillmentCombination presets for that variant — tried in
    // priority order, each verified against AVAILABLE stock before committing.
    if (variantId) {
      const presetCombos = await this.prisma.fulfillmentCombination.findMany({
        where: { variantId, active: true },
        include: { items: { include: { denomination: true } } },
        orderBy: { priority: 'asc' },
      });

      for (const combo of presetCombos) {
        let allSufficient = combo.items.length > 0;
        const items: { denominationId: string; faceValue: number; count: number }[] = [];

        for (const item of combo.items) {
          const stockEntry = activeStock.find((s) => s.denominationId === item.denominationId);
          const availableCount = stockEntry ? stockEntry.availableCount : 0;
          if (availableCount < item.quantity) {
            allSufficient = false;
            this.logger.warn(
              `[Fulfillment] Variant preset "${combo.name}" — denomination $${item.denomination.faceValue} needs ${item.quantity}, has ${availableCount} available.`,
            );
            break;
          }
          items.push({
            denominationId: item.denominationId,
            faceValue: Number(item.denomination.faceValue),
            count: item.quantity,
          });
        }

        if (allSufficient) {
          combination = items;
          usedVariantPreset = true;
          this.logger.log(
            `[Fulfillment] Variant preset "${combo.name}" ready: ${items.map((i) => `$${i.faceValue} x${i.count}`).join(' + ')}`,
          );
          break;
        }
      }

      if (!combination && presetCombos.length > 0) {
        this.logger.warn(`[Fulfillment] ${presetCombos.length} preset(s) exist for variant ${variantId} but none are fulfillable right now.`);
      }
    }

    let essentialsConfigured = false;
    if (!combination && productType === 'ESSENTIALS') {
      const deliveryItems = await this.prisma.essentialsDeliveryItem.findMany({
        where: { productId },
        include: { denomination: true },
      });

      if (deliveryItems.length === 0) {
        // No admin-configured bundle for this product — fall through to amount-based
        // denomination matching below instead of failing outright.
        this.logger.warn(`[Fulfillment] No Essentials delivery configuration for product ${productId} — falling back to amount-based denomination matching.`);
      } else {
        essentialsConfigured = true;
        // Verify EVERY required denomination has sufficient AVAILABLE stock before
        // committing to anything — no partial bundle delivery.
        let allSufficient = true;
        const items: { denominationId: string; faceValue: number; count: number }[] = [];

        for (const rule of deliveryItems) {
          const stockEntry = activeStock.find((s) => s.denominationId === rule.denominationId);
          const availableCount = stockEntry ? stockEntry.availableCount : 0;
          if (availableCount < rule.quantity) {
            allSufficient = false;
            this.logger.warn(`[Fulfillment] Essentials rule for product ${productId} — denomination $${rule.denomination.faceValue} needs ${rule.quantity}, has ${availableCount} available.`);
            break;
          }
          items.push({
            denominationId: rule.denominationId,
            faceValue: Number(rule.denomination.faceValue),
            count: rule.quantity,
          });
        }

        if (allSufficient) {
          combination = items;
          this.logger.log(`[Fulfillment] Essentials delivery rule ready for product ${productId}: ${items.map((i) => `$${i.faceValue} x${i.count}`).join(' + ')}`);
        }
      }
    }

    // NORMAL / amount-based allocation — also the fallback for products without an
    // admin-configured Essentials bundle.
    if (!combination && !essentialsConfigured) {
      if (exactDenominationId) {
        // Denomination is explicitly mapped — use it directly, ignore order amount.
        // The amount is (denomination faceValue × quantity) as set by the webhook.
        // Calculate count = amount / faceValue to support multi-quantity orders.
        const exactDenom = activeStock.find((d) => d.denominationId === exactDenominationId);
        if (exactDenom && exactDenom.availableCount > 0) {
          const count = Math.round(amount / exactDenom.faceValue);
          if (count > 0 && exactDenom.availableCount >= count) {
            combination = [{ denominationId: exactDenominationId, faceValue: exactDenom.faceValue, count }];
            this.logger.log(`[Fulfillment] Exact denomination $${exactDenom.faceValue} × ${count} codes (amount $${amount})`);
          } else if (count > 0 && exactDenom.availableCount > 0) {
            // Not enough stock for full quantity — try partial, then fall back to combination search
            this.logger.warn(`[Fulfillment] Exact denomination $${exactDenom.faceValue} needs ${count} codes but only ${exactDenom.availableCount} available — falling back to combination search.`);
          }
        }
        if (!combination) {
          this.logger.warn(`[Fulfillment] Exact denomination ${exactDenominationId} has no available stock — falling back to combination search.`);
        }
      }

      if (!combination) {
        // No exact denomination mapped (or exact denom failed) — try single denomination that matches exactly
        const exactMatch = activeStock.find((d) => d.faceValue === amount && d.availableCount > 0);
        if (exactMatch) {
          combination = [{ denominationId: exactMatch.denominationId, faceValue: exactMatch.faceValue, count: 1 }];
        }
        if (!combination) {
          // Largest-first subset-sum fallback (e.g. $50 requested, no $50 stock ->
          // delivers $40+$10 or $25+$25 — whichever combination exists, fewest codes).
          const fallbackCombo = this.allocationEngine.findBestCombination(activeStock, amount);
          if (fallbackCombo) {
            combination = fallbackCombo;
            this.logger.log(`[Fulfillment] Combination fallback for amount ${amount}: ${fallbackCombo.map((c) => `$${c.faceValue} x${c.count}`).join(' + ')}`);
          } else {
            this.logger.warn(`[Fulfillment] No denomination combination sums to ${amount} for NORMAL product.`);
          }
        }
      }
    }
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

    // Calculate total cost — normally the sum of allocated denomination face
    // values, which for an amount-matched order equals the amount requested.
    let totalCost = combination.reduce((acc, c) => acc + c.faceValue * c.count, 0);

    // A pack is sold at its shelf price, not at the face value of the codes
    // behind it. The preset says what to hand over — "PS Essential 1 Month sends
    // $10 + $20" — and the pack's price says what that sale costs, so a $9.99
    // subscription is charged 9.99 even though $30 of codes are delivered.
    // A discount reduces the sale price, and therefore the charge, without
    // changing which codes go out.
    if (usedVariantPreset) {
      totalCost = pricing ? pricing.net_amount : amount;
    }

    // Validate combination total exactly matches the requested amount.
    //
    // Skipped when the codes were chosen deliberately rather than derived from
    // the amount: an explicitly mapped denomination, or a variant preset. A
    // preset is the admin's own statement of what a pack delivers — "PS
    // Essential 1 Month sends $10 + $20" — and a pack's shelf price has no
    // reason to equal the face value of the codes behind it. Rejecting the
    // order because $30 of codes does not equal a $9.99 price would make
    // presets unusable for exactly the subscriptions they exist for.
    //
    // The merchant is still charged totalCost, the value actually handed over.
    if (totalCost !== amount && !exactDenominationId && !usedVariantPreset) {
      this.logger.error(`[Fulfillment] Combination total ${totalCost} does not match requested amount ${amount}`);
      const failedReq = await this.prisma.fulfillmentRequest.create({
        data: {
          merchantId,
          productId,
          amount,
          currency,
          idempotencyKey,
          referenceId,
          status: 'FAILED',
          failureReason: `Combination total ${totalCost} does not match requested amount ${amount}`,
          sandbox: sandbox || false,
        },
      });

      await this.auditService.log({
        actorType: actorType || 'SYSTEM',
        actorId: actorId || merchantId,
        action: 'fulfillment.failed',
        entity: 'FulfillmentRequest',
        entityId: failedReq.id,
        metadata: { reason: 'AMOUNT_MISMATCH', requested: amount, combinationTotal: totalCost },
        ip,
      });

      throw new BadRequestException({
        error: 'INSUFFICIENT_INVENTORY',
        code: 'AMOUNT_MISMATCH',
        message: `No combination of available denominations exactly sums to ${amount}`,
      });
    }

    // Skip wallet check for merchant-owned inventory or sandbox mode
    // Admin-created orders are the platform's own responsibility — no wallet is
    // checked or charged; stock is fulfilled straight from the vault.
    const skipWallet = sandbox || useMerchantPool || actorType === 'ADMIN';

    // Prices are held in USD; a wallet is charged in its own currency. Resolve the
    // rate once, before the transaction, so every check and write below agrees on
    // it and a mid-order rate change cannot split the charge across two rates.
    const walletCurrency = normaliseCurrency(merchant.currency || 'USD');
    const fxRate = skipWallet ? 1 : await this.currencyService.getRate(walletCurrency);
    const chargeFor = (costUsd: number) => convertFromUsd(costUsd, fxRate);
    let chargedAmount = chargeFor(totalCost);

    if (!skipWallet) {
      // Check wallet balance, in the wallet's own currency
      if (Number(merchant.walletBalance) < chargedAmount) {
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
          metadata: {
            reason: 'INSUFFICIENT_WALLET', balance: merchant.walletBalance,
            required: chargedAmount, currency: walletCurrency, amountUsd: totalCost, fxRate,
          },
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
          message: `Insufficient wallet balance. Required: ${chargedAmount} ${walletCurrency}, Available: ${merchant.walletBalance} ${walletCurrency}`,
        });
      }
    }

    const reservationTtl = this.configService.get<number>('RESERVATION_TTL_MINUTES', 15);
    // This helper uses the root Prisma connection. Resolve before opening the
    // transaction so it cannot wait on locks held by its own fulfillment.
    const revenueWalletId = (!skipWallet || (pricing && !sandbox))
      ? await this.walletService.getOrCreateAdminWallet() : null;

    // Execute everything in a transaction with retry for stock conflicts
    const MAX_RETRIES = 3;
    let result: any;
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Re-check availability on retries (a concurrent request may have taken stock)
        if (attempt > 1) {
          this.logger.log(`[Fulfillment] Retry attempt ${attempt}/${MAX_RETRIES} for ${idempotencyKey}`);

          if (productType === 'ESSENTIALS') {
            // ESSENTIALS: re-verify every required denomination in the delivery rule
            // still has sufficient AVAILABLE stock. No individual codes are pinned —
            // just re-check the denomination+quantity rule against current stock.
            const deliveryItems = await this.prisma.essentialsDeliveryItem.findMany({
              where: { productId },
              include: { denomination: true },
            });
            if (deliveryItems.length === 0) {
              throw new BadRequestException({
                error: 'INSUFFICIENT_STOCK',
                code: 'NO_DELIVERY_CONFIG',
                message: 'Essentials product has no delivery configuration',
              });
            }
            const retryStock = await this.allocationEngine.getAvailableStock(this.prisma, productId, activePoolMerchantId);
            const retryItems: { denominationId: string; faceValue: number; count: number }[] = [];
            for (const rule of deliveryItems) {
              const stockEntry = retryStock.find((s) => s.denominationId === rule.denominationId);
              const availableCount = stockEntry ? stockEntry.availableCount : 0;
              if (availableCount < rule.quantity) {
                throw new BadRequestException({
                  error: 'INSUFFICIENT_STOCK',
                  code: 'INSUFFICIENT_STOCK',
                  message: `Denomination $${rule.denomination.faceValue} needs ${rule.quantity}, only ${availableCount} available after retry`,
                });
              }
              retryItems.push({ denominationId: rule.denominationId, faceValue: Number(rule.denomination.faceValue), count: rule.quantity });
            }
            combination.length = 0;
            combination.push(...retryItems);
          } else {
            // NORMAL: exact denomination only — no auto-combination
            const retryStock = await this.allocationEngine.getAvailableStock(this.prisma, productId, activePoolMerchantId);
            const retryDenoms = retryStock.filter((s) => s.availableCount > 0);
            if (retryDenoms.length === 0) {
              throw new BadRequestException({
                error: 'INSUFFICIENT_STOCK',
                code: 'INSUFFICIENT_STOCK',
                message: 'No available stock for this product after retry',
              });
            }

            let retryCombo: { denominationId: string; faceValue: number; count: number }[] | null = null;
            if (exactDenominationId) {
              const exactDenom = retryDenoms.find((d) => d.denominationId === exactDenominationId);
              if (exactDenom && exactDenom.availableCount > 0) {
                const remainder = amount % exactDenom.faceValue;
                if (remainder === 0) {
                  const count = amount / exactDenom.faceValue;
                  if (count <= exactDenom.availableCount) {
                    retryCombo = [{ denominationId: exactDenominationId, faceValue: exactDenom.faceValue, count }];
                  }
                }
              }
            } else {
              const exactMatch = retryDenoms.find((d) => d.faceValue === amount && d.availableCount > 0);
              if (exactMatch) {
                retryCombo = [{ denominationId: exactMatch.denominationId, faceValue: exactMatch.faceValue, count: 1 }];
              }
            }

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
            if (totalCost !== amount) {
              throw new BadRequestException({
                error: 'INSUFFICIENT_INVENTORY',
                code: 'AMOUNT_MISMATCH',
                message: `Combination total ${totalCost} does not match requested amount ${amount} after retry`,
              });
            }
            // Keep the wallet charge in step with the re-picked combination.
            chargedAmount = chargeFor(totalCost);
          }
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
              discountAmount: pricing?.discount_amount ?? 0,
              sandbox: sandbox || false,
              customerEmail: customerEmail || null,
              customerName: customerName || null,
              customerAddress: customerAddress || null,
              inventorySource: useMerchantPool ? 'MERCHANT' : 'DCV',
            },
          });

          // 2. Reserve codes with row-level locking.
          // Both NORMAL and ESSENTIALS use denomination+count combinations — the admin
          // never pins individual code IDs. ANY available code matching each required
          // denomination is atomically selected and reserved here.
          let allocationResults: AllocationResult[];
          try {
            allocationResults = await this.allocationEngine.reserveCodes(
              tx,
              fulfillmentReq.id,
              combination,
              reservationTtl,
              activePoolMerchantId,
            );
          } catch (err) {
            await this.allocationEngine.releaseReservation(tx, fulfillmentReq.id);
            throw err;
          }

          // 3. Debit wallet (skip in sandbox mode or for merchant-owned inventory)
          let updatedMerchant: any;
          if (skipWallet) {
            updatedMerchant = await tx.merchant.findUnique({ where: { id: merchantId } });
          } else {
            updatedMerchant = await tx.merchant.update({
              where: { id: merchantId },
              data: {
                walletBalance: { decrement: chargedAmount },
              },
            });

            // Guard against negative balance (second safety net)
            if (Number(updatedMerchant.walletBalance) < 0) {
              throw new BadRequestException({
                error: 'INSUFFICIENT_WALLET',
                code: 'NEGATIVE_BALANCE_GUARD',
                message: `Transaction would result in negative balance. This should not happen — pre-check failed.`,
              });
            }

            // 4. Create wallet transaction record
            await tx.walletTransaction.create({
              data: {
                merchantId,
                type: 'DEBIT',
                amount: chargedAmount,
                currency: walletCurrency,
                balanceAfter: updatedMerchant.walletBalance,
                referenceId: fulfillmentReq.id,
                fulfillmentId: fulfillmentReq.id,
              },
            });

            // The platform's own books stay in USD regardless of what the merchant
            // wallet is denominated in, so revenue across merchants stays comparable.
            await tx.fulfillmentRequest.update({
              where: { id: fulfillmentReq.id },
              data: { chargedCurrency: walletCurrency, chargedAmount, fxRate },
            });

            // 4b. Credit admin/platform wallet atomically
            const adminWalletId = revenueWalletId!;
            const updatedAdminWallet = await tx.adminWallet.update({
              where: { id: adminWalletId },
              data: { balance: { increment: totalCost } },
            });
            await tx.adminWalletTransaction.create({
              data: {
                adminWalletId,
                type: 'CREDIT',
                amount: totalCost,
                balanceAfter: updatedAdminWallet.balance,
                referenceId: fulfillmentReq.id,
                source: 'FULFILLMENT',
                description: `Fulfillment revenue from merchant ${merchantId}`,
              },
            });
          }

          // Manual sales record net platform revenue without debiting a merchant.
          if (pricing && !sandbox) {
            const adminWalletId = revenueWalletId!;
            const updatedAdminWallet = await tx.adminWallet.update({
              where: { id: adminWalletId },
              data: { balance: { increment: pricing.net_amount } },
            });
            await tx.adminWalletTransaction.create({
              data: {
                adminWalletId,
                type: 'CREDIT',
                amount: pricing.net_amount,
                balanceAfter: updatedAdminWallet.balance,
                referenceId: fulfillmentReq.id,
                source: 'FULFILLMENT',
                description: `Manual order: original ${amount}, discount ${pricing.discount_amount}, net ${pricing.net_amount} ${currency}`,
              },
            });
          }

          // 5. Verify allocation results contain actual code item IDs
          const allAllocatedIds = allocationResults.flatMap((r) => r.codeItemIds);
          if (allAllocatedIds.length === 0) {
            await this.allocationEngine.releaseReservation(tx, fulfillmentReq.id);
            throw new BadRequestException({
              error: 'ALLOCATION_FAILED',
              code: 'NO_CODES_ALLOCATED',
              message: 'No code items were allocated — combination produced zero results',
            });
          }

          // 6. Confirm allocation (codes → ALLOCATED)
          await this.allocationEngine.confirmAllocation(tx, fulfillmentReq.id, allocationResults);

          // 7. Update fulfillment status
          const updatedReq = await tx.fulfillmentRequest.update({
            where: { id: fulfillmentReq.id },
            data: { status: 'ALLOCATED', walletCharged: !skipWallet },
            include: { allocations: true },
          });

          // 8. Generate permanent delivery token (no expiry — link is permanently accessible)
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
        ...(pricing ? { pricing } : {}),
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
    const purchaseDate = result.fulfillmentReq.createdAt.toISOString();

    if (customerEmail) {
      // ONE consolidated email per customer session: enqueue this order into the
      // customer's digest. Everything bought within the digest window arrives in
      // a single email with a reveal button per item.
      const codesDelivered = combination.reduce((acc, c) => acc + c.count, 0);
      this.orderDigestService.enqueue(
        customerEmail,
        {
          productName: product.name,
          fulfillmentId: result.fulfillmentReq.id,
          referenceId,
          amount,
          currency,
          codesDelivered,
          deliveryLink,
        },
        { customerName: customerName || undefined, merchantName: merchant.name },
      );
    }

    // Send purchase notification email to merchant; fall back to a plain delivery-link
    // email when there is no customer attached to the order. Admin-created orders
    // belong to the internal platform merchant — skip merchant emails for those.
    if (actorType !== 'ADMIN' && customerEmail && merchant && product) {
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
    } else if (actorType !== 'ADMIN' && merchant && product) {
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
      ...(pricing ? { ...pricing, currency } : {}),
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

    let refundAmount = req.walletTxn ? req.walletTxn.amount : 0;
    const revenueWalletId = req.walletTxn
      ? await this.walletService.getOrCreateAdminWallet() : null;

    const result = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set takes a row lock and rechecks the status in the database.
      // Only one reversal may proceed; a concurrent status change also loses
      // the claim. The claim rolls back with any failed allocation/ledger write.
      const claim = await tx.fulfillmentRequest.updateMany({
        where: { id: fulfillmentId, status: req.status },
        data: { status: 'REVERSED' },
      });
      if (claim.count !== 1) {
        throw new ConflictException('Fulfillment status changed; reversal was not applied');
      }

      // Release codes back to AVAILABLE
      await this.allocationEngine.reverseAllocation(tx, fulfillmentId);

      // Manual orders have no merchant debit to refund. Reverse only the actual
      // platform credit (legacy manual orders may not have a revenue record).
      if (!req.walletTxn) {
        const revenue = await tx.adminWalletTransaction.findFirst({
          where: { referenceId: fulfillmentId, source: 'FULFILLMENT', type: 'CREDIT' },
        });
        if (revenue) {
          refundAmount = revenue.amount;
          const wallet = await tx.adminWallet.update({
            where: { id: revenue.adminWalletId },
            data: { balance: { decrement: revenue.amount } },
          });
          await tx.adminWalletTransaction.create({
            data: {
              adminWalletId: revenue.adminWalletId,
              type: 'DEBIT',
              amount: revenue.amount,
              balanceAfter: wallet.balance,
              referenceId: fulfillmentId,
              source: 'REFUND',
              description: `Reversal of manual fulfillment ${fulfillmentId}`,
            },
          });
        }
        return tx.fulfillmentRequest.update({ where: { id: fulfillmentId }, data: { status: 'REVERSED' } });
      }

      // Credit wallet back
      const updatedMerchant = await tx.merchant.update({
        where: { id: req.merchantId },
        data: { walletBalance: { increment: refundAmount } },
      });

      // Create refund wallet transaction, in the wallet's own currency
      await tx.walletTransaction.create({
        data: {
          merchantId: req.merchantId,
          type: 'REFUND',
          amount: refundAmount,
          currency: req.walletTxn.currency || 'USD',
          balanceAfter: updatedMerchant.walletBalance,
          referenceId: fulfillmentId,
          fulfillmentId: fulfillmentId,
        },
      });

      // Reverse admin wallet credit. The platform's books are in USD, so the debit
      // must undo the USD credit actually recorded, not the merchant-currency
      // refund, which for a non-USD wallet is a completely different number.
      const revenue = await tx.adminWalletTransaction.findFirst({
        where: { referenceId: fulfillmentId, source: 'FULFILLMENT', type: 'CREDIT' },
      });
      const usdReversal = revenue ? Number(revenue.amount) : Number(req.amount);
      const adminWalletId = revenue?.adminWalletId ?? revenueWalletId!;
      const updatedAdminWallet = await tx.adminWallet.update({
        where: { id: adminWalletId },
        data: { balance: { decrement: usdReversal } },
      });
      await tx.adminWalletTransaction.create({
        data: {
          adminWalletId,
          type: 'DEBIT',
          amount: usdReversal,
          balanceAfter: updatedAdminWallet.balance,
          referenceId: fulfillmentId,
          source: 'REFUND',
          description: `Reversal of fulfillment ${fulfillmentId}`,
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
      original_amount: Number(req.amount),
      discount_amount: Number(req.discountAmount ?? 0),
      net_amount: (Math.round(Number(req.amount) * 100) - Math.round(Number(req.discountAmount ?? 0) * 100)) / 100,
      currency: req.currency,
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
        if (totalCost !== Number(req.amount)) {
          results.push({ id: req.id, success: false, reason: `Combination total ${totalCost} does not match requested amount ${req.amount}` });
          continue;
        }

        const reservationTtl = this.configService.get<number>('RESERVATION_TTL_MINUTES', 15);
        const adminWalletId = await this.walletService.getOrCreateAdminWallet();

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

          // Verify allocation results contain actual code item IDs
          const allAllocatedIds = allocationResults.flatMap((r) => r.codeItemIds);
          if (allAllocatedIds.length === 0) {
            await this.allocationEngine.releaseReservation(tx, req.id);
            throw new BadRequestException({
              error: 'ALLOCATION_FAILED',
              code: 'NO_CODES_ALLOCATED',
              message: 'No code items were allocated — combination produced zero results',
            });
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

          // Credit admin/platform wallet atomically
          const updatedAdminWallet = await tx.adminWallet.update({
            where: { id: adminWalletId },
            data: { balance: { increment: totalCost } },
          });
          await tx.adminWalletTransaction.create({
            data: {
              adminWalletId,
              type: 'CREDIT',
              amount: totalCost,
              balanceAfter: updatedAdminWallet.balance,
              referenceId: req.id,
              source: 'FULFILLMENT',
              description: `Supplier auto-fulfillment revenue from merchant ${req.merchantId}`,
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
