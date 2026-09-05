import { Injectable, Logger, OnModuleDestroy, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { ProviderDetector } from './provider-detector';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import * as crypto from 'crypto';

interface WebhookJobData {
  endpointId: string;
  url: string;
  secret: string;
  payload: any;
}

@Injectable()
export class WebhookService implements OnModuleDestroy {
  private readonly logger = new Logger(WebhookService.name);
  private queue: any = null;
  private worker: any = null;
  private readonly maxRetries: number;
  private readonly redisUrl: string;
  private processingQueue: Promise<void> = Promise.resolve();
  private readonly isProduction: boolean;

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private configService: ConfigService,
    @Inject(forwardRef(() => FulfillmentService)) private fulfillmentService: FulfillmentService,
  ) {
    this.maxRetries = this.configService.get<number>('WEBHOOK_MAX_RETRIES', 8);
    this.redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    this.initBullMQ();
  }

  private async initBullMQ() {
    const explicitRedis = this.configService.get<string>('REDIS_URL');
    if (!explicitRedis) {
      this.logger.warn('No REDIS_URL configured. Using in-memory webhook queue.');
      this.initFallbackQueue();
      return;
    }

    try {
      // Test Redis connection before initializing BullMQ
      const { Queue, Worker } = await import('bullmq');
      const connection = { url: this.redisUrl };

      this.queue = new Queue('webhook-delivery', {
        connection,
        defaultJobOptions: {
          attempts: this.maxRetries,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      });

      // Test that the queue can actually connect by checking its connection
      try {
        await Promise.race([
          this.queue.client,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Redis connection timeout')), 3000),
          ),
        ]);
      } catch {
        this.logger.warn('Redis not reachable, using in-memory fallback queue for webhooks');
        this.queue = null;
        this.initFallbackQueue();
        return;
      }

      this.worker = new Worker(
        'webhook-delivery',
        async (job: { data: WebhookJobData }) => {
          await this.deliverWebhook(job.data);
        },
        {
          connection,
          concurrency: 5,
          // A BullMQ worker polls Redis continuously while idle, and on a metered
          // Redis (Upstash) that alone exhausted a 500k monthly request quota.
          // `drainDelay` is how long an idle worker blocks waiting for work: a
          // longer block means far fewer commands, and it costs no latency for
          // new jobs because adding one wakes the blocked call immediately.
          drainDelay: this.configService.get<number>('WEBHOOK_DRAIN_DELAY_SECONDS', 60),
          // Stalled-job scans are pure overhead when nothing is stalled.
          stalledInterval: this.configService.get<number>('WEBHOOK_STALLED_INTERVAL_MS', 300_000),
          // The lock must outlive a delivery attempt, and comfortably exceed the
          // gap between stalled scans, or healthy jobs get treated as stalled.
          lockDuration: this.configService.get<number>('WEBHOOK_LOCK_DURATION_MS', 90_000),
        },
      );

      this.worker.on('completed', (job: any) => {
        this.logger.log(`Webhook job ${job.id} completed`);
      });

      this.worker.on('failed', (job: any, err: Error) => {
        this.logger.error(`Webhook job ${job?.id} failed: ${err.message}`);
      });

      this.logger.log('BullMQ webhook queue initialized');
    } catch {
      this.logger.warn('BullMQ not available, using in-memory fallback queue');
      this.queue = null;
      this.initFallbackQueue();
    }
  }

  private processingInterval?: ReturnType<typeof setInterval>;
  private readonly memQueue: WebhookJobData[] = [];

  private initFallbackQueue() {
    this.processingInterval = setInterval(() => this.processFallbackQueue(), 5000);
  }

  private async processFallbackQueue() {
    if (this.memQueue.length === 0) return;
    const job = this.memQueue.shift();
    if (!job) return;
    try {
      await this.deliverWebhook(job);
    } catch (err) {
      this.logger.warn(`Fallback webhook delivery failed: ${(err as Error).message}`);
    }
  }

  /**
   * Resolve an incoming storefront SKU against every level a SKU can live at.
   *
   * A SKU identifies a product (PSN-USA), one of its code values (PSN-USA-10),
   * or one of its packs (PSN-USA-ESS-1M). Matching only looked at Product.sku,
   * so a value or pack SKU was rejected as unmapped even though it was set —
   * the stored Denomination.sku and Variant.sku columns were never consulted.
   *
   * A pack resolves to its variant, which is what selects the delivery rule; a
   * code value resolves to that exact denomination.
   */
  private async resolveSku(sku: string): Promise<{
    product: any; denominationId?: string; variantId?: string; matchedOn: string;
  } | null> {
    const value = (sku || '').trim();
    if (!value) return null;

    const product = await this.prisma.product.findFirst({
      where: { sku: value, status: 'ACTIVE' },
    });
    if (product) return { product, matchedOn: 'product SKU' };

    const denomination = await this.prisma.denomination.findFirst({
      where: { sku: value },
      include: { product: true },
    });
    if (denomination?.product && denomination.product.status === 'ACTIVE') {
      return {
        product: denomination.product,
        denominationId: denomination.id,
        matchedOn: 'code value SKU',
      };
    }

    const variant = await this.prisma.variant.findFirst({
      where: { sku: value },
      include: { productRegion: { include: { product: true } } },
    });
    const variantProduct = variant?.productRegion?.product;
    if (variant && variantProduct && variantProduct.status === 'ACTIVE') {
      return { product: variantProduct, variantId: variant.id, matchedOn: 'pack SKU' };
    }

    return null;
  }

  private async deliverWebhook(data: WebhookJobData): Promise<void> {
    const body = JSON.stringify(data.payload);
    const signature = crypto
      .createHmac('sha256', data.secret)
      .update(body)
      .digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(data.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': data.payload.event,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status >= 200 && response.status < 300) {
        this.logger.log(`Webhook delivered to ${data.url} (status ${response.status})`);
      } else {
        throw new Error(`Webhook returned status ${response.status}`);
      }
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  async queueWebhookEvent(
    merchantId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { merchantId, status: 'ACTIVE' },
    });

    if (endpoints.length === 0) {
      this.logger.debug(`No active webhook endpoints for merchant ${merchantId}`);
      return;
    }

    this.logger.log(`Queuing webhook event '${event}' to ${endpoints.length} endpoint(s) for merchant ${merchantId}`);

    const payload = {
      event,
      ...data,
      timestamp: Date.now(),
    };

    for (const endpoint of endpoints) {
      const jobData: WebhookJobData = {
        endpointId: endpoint.id,
        url: endpoint.url,
        secret: endpoint.secret,
        payload,
      };

      if (this.queue) {
        try {
          await this.queue.add('webhook', jobData);
        } catch (err) {
          this.logger.warn(`BullMQ queue.add failed, falling back to in-memory: ${(err as Error).message}`);
          this.memQueue.push(jobData);
        }
      } else {
        this.memQueue.push(jobData);
      }
    }
  }

  async registerEndpoint(merchantId: string, url: string, skipVerification: boolean = false) {
    // ─── Validate URL format ───
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      throw new BadRequestException({
        error: 'INVALID_URL',
        code: 'URL_EMPTY',
        message: 'Webhook URL is required',
      });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException({
        error: 'INVALID_URL',
        code: 'URL_FORMAT_INVALID',
        message: 'Invalid URL format. Please provide a valid HTTP or HTTPS URL.',
      });
    }

    const protocol = parsedUrl.protocol;
    const hostname = parsedUrl.hostname;

    // Allow any HTTPS URL, or http://localhost / http://127.0.0.1 for testing
    const isHttps = protocol === 'https:';
    const isLocalhost = protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0');

    if (!isHttps && !isLocalhost) {
      throw new BadRequestException({
        error: 'INVALID_URL',
        code: 'WEBHOOK_URL_NOT_HTTPS',
        message: 'Webhook URL must use HTTPS (or http://localhost / http://127.0.0.1 for local development/testing).',
      });
    }

    // ─── Verify endpoint is reachable and responds to challenge ───
    // skipVerification allows registering without challenge-response proof.
    // This is safe because the registration request itself is authenticated
    // via API key + HMAC signature — only the merchant can register endpoints.
    // For localhost URLs, skip is always allowed (development/testing).
    // For HTTPS URLs, skip is allowed when the merchant explicitly requests it.
    const secret = this.encryptionService.generateToken(32);

    const canSkipVerification = skipVerification || isLocalhost;

    if (!canSkipVerification) {
      await this.verifyWebhookChallenge(url, merchantId);
    } else if (!isLocalhost) {
      this.logger.warn(`[WEBHOOK] Skipping verification for HTTPS URL (merchant requested): ${url}`);
    } else {
      this.logger.warn(`[WEBHOOK] Skipping verification for localhost URL: ${url}`);
    }

    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        merchantId,
        url,
        secret,
        status: 'ACTIVE',
      },
    });

    return {
      id: endpoint.id,
      url: endpoint.url,
      status: endpoint.status,
      secret,
    };
  }

  /**
   * Sends a challenge-response verification request to a candidate outgoing webhook URL
   * and validates the result. This only runs when a merchant registers a new outgoing
   * webhook endpoint (Add Webhook flow) — it never touches incoming webhook processing,
   * handlers, workers, or queues.
   *
   * Every attempt is logged with the full request/response context so failures can be
   * diagnosed without having to reproduce the request manually.
   */
  private async verifyWebhookChallenge(url: string, merchantId: string): Promise<void> {
    const challenge = this.encryptionService.generateToken(16);
    const requestHeaders = { 'Content-Type': 'application/json' };
    const requestBody = {
      event: 'webhook.verification',
      challenge,
      timestamp: Date.now(),
    };

    const attempt: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      merchantId,
      url,
      method: 'POST',
      requestHeaders,
      requestBody,
    };

    // ─── Step 1: is the endpoint reachable at all? ───
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err: any) {
      const { code, message } = this.classifyVerificationNetworkError(err);
      attempt.verificationResult = 'FAILED';
      attempt.errorCode = code;
      attempt.errorMessage = message;
      this.logger.warn(`[WEBHOOK_VERIFY] ${JSON.stringify(attempt)}`);
      throw new BadRequestException({ error: 'VERIFICATION_FAILED', code, message });
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    const responseBody = await response.text().catch(() => '');

    attempt.responseStatus = response.status;
    attempt.responseHeaders = responseHeaders;
    attempt.responseBody = responseBody.slice(0, 2000);

    // ─── Step 2: did the endpoint return a successful HTTP response? ───
    if (response.status < 200 || response.status >= 300) {
      const message = `Endpoint returned HTTP ${response.status}. Enable "Skip Verification" to add this webhook without verification if this is expected.`;
      attempt.verificationResult = 'FAILED';
      attempt.errorMessage = message;
      this.logger.warn(`[WEBHOOK_VERIFY] ${JSON.stringify(attempt)}`);
      throw new BadRequestException({
        error: 'VERIFICATION_FAILED',
        code: 'WEBHOOK_RETURNED_ERROR',
        message,
      });
    }

    // ─── Step 3: did the endpoint echo back the challenge? ───
    // Many real-world providers (Shopify, WooCommerce, generic storefronts, etc.) are
    // reachable and return 2xx but were never built to echo a challenge value — they
    // rely on webhook signatures instead. That is not the same failure as an unreachable
    // or erroring endpoint, so it gets its own result and message.
    const challengeEchoed = responseBody.includes(challenge);

    if (!challengeEchoed) {
      const message = 'This endpoint is reachable but does not support challenge-response verification. Many providers use webhook signatures instead. You may safely enable "Skip Verification" if you trust this endpoint.';
      attempt.verificationResult = 'CHALLENGE_NOT_SUPPORTED';
      attempt.errorMessage = message;
      this.logger.log(`[WEBHOOK_VERIFY] ${JSON.stringify(attempt)}`);
      throw new BadRequestException({
        error: 'CHALLENGE_NOT_SUPPORTED',
        code: 'CHALLENGE_NOT_SUPPORTED',
        message,
      });
    }

    attempt.verificationResult = 'SUCCESS';
    this.logger.log(`[WEBHOOK_VERIFY] ${JSON.stringify(attempt)}`);
  }

  /**
   * Maps a low-level fetch/network error (DNS, TCP, TLS, timeout, etc.) to a specific,
   * user-facing error code and message instead of a generic failure.
   */
  private classifyVerificationNetworkError(err: any): { code: string; message: string } {
    const errMsg: string = err?.message || err?.cause?.message || String(err) || '';

    if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ECONNRESET')) {
      return {
        code: 'CONNECTION_REFUSED',
        message: 'Connection refused. The webhook endpoint is not accepting connections. Enable "Skip Verification" to add this webhook anyway.',
      };
    }

    if (errMsg.includes('ENOTFOUND') || errMsg.includes('EAI_AGAIN')) {
      return {
        code: 'DNS_RESOLUTION_FAILED',
        message: 'DNS lookup failed. The webhook endpoint hostname could not be resolved. Enable "Skip Verification" to add this webhook anyway.',
      };
    }

    if (
      errMsg.includes('CERT_HAS_EXPIRED') ||
      errMsg.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE') ||
      errMsg.includes('SELF_SIGNED_CERT') ||
      errMsg.includes('DEPTH_ZERO_SELF_SIGNED_CERT') ||
      errMsg.includes('CERT_')
    ) {
      return {
        code: 'SSL_CERTIFICATE_INVALID',
        message: 'SSL certificate validation failed. Enable "Skip Verification" to add this webhook anyway.',
      };
    }

    if (
      errMsg.includes('timeout') ||
      errMsg.includes('Timeout') ||
      errMsg.includes('AbortError') ||
      errMsg.includes('aborted') ||
      errMsg.includes('ETIMEDOUT')
    ) {
      return {
        code: 'CONNECTION_TIMEOUT',
        message: 'Connection timed out. The webhook endpoint did not respond within 10 seconds. Enable "Skip Verification" to add this webhook anyway.',
      };
    }

    if (errMsg.includes('EPROTO') || errMsg.includes('Protocol')) {
      return {
        code: 'PROTOCOL_ERROR',
        message: 'Protocol error. The webhook endpoint may not support HTTPS. Enable "Skip Verification" to add this webhook anyway.',
      };
    }

    return {
      code: 'WEBHOOK_UNREACHABLE',
      message: `Webhook verification failed: ${errMsg || 'Unknown error'}. Enable "Skip Verification" to add this webhook anyway.`,
    };
  }

  async listEndpoints(merchantId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { merchantId },
      select: {
        id: true,
        url: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteEndpoint(merchantId: string, endpointId: string) {
    await this.prisma.webhookEndpoint.deleteMany({
      where: { id: endpointId, merchantId },
    });
    return { success: true };
  }

  async processIncomingWebhook(payload: any, headers: any, sourceIp?: string) {
    this.logger.log(`[WEBHOOK] Received incoming webhook`);

    // Log raw payload structure for debugging multi-item issues
    try {
      const p = payload || {};
      const pKeys = Object.keys(p);
      const li = p?.line_items || p?.order?.line_items || p?.data?.line_items || [];
      this.logger.log(`[WEBHOOK] Incoming payload keys: [${pKeys.join(',')}] line_items count: ${li.length}`);
    } catch (e) { /* ignore */ }

    // ─── Authenticate the webhook by verifying the merchant's webhook secret ───
    const webhookSecret =
      headers['x-webhook-secret'] ||
      headers['X-Webhook-Secret'] ||
      headers['x-dcv-secret'] ||
      headers['X-Dcv-Secret'] ||
      null;

    if (!webhookSecret) {
      this.logger.warn(`[WEBHOOK] Rejected: missing X-Webhook-Secret header`);
      throw new BadRequestException({
        error: 'UNAUTHORIZED',
        code: 'MISSING_WEBHOOK_SECRET',
        message: 'X-Webhook-Secret header is required. Get your webhook secret from the merchant dashboard.',
      });
    }

    const merchant = await this.prisma.merchant.findFirst({
      where: { webhookSecret: String(webhookSecret), status: 'ACTIVE' },
    });

    if (!merchant) {
      this.logger.warn(`[WEBHOOK] Rejected: invalid webhook secret`);
      throw new BadRequestException({
        error: 'UNAUTHORIZED',
        code: 'INVALID_WEBHOOK_SECRET',
        message: 'Invalid or expired webhook secret.',
      });
    }

    this.logger.log(`[WEBHOOK] Authenticated as merchant: ${merchant.id}`);

    // Detect provider and normalize payload
    const detected = ProviderDetector.detect(headers, payload);
    const normalized = ProviderDetector.normalize(headers, payload);
    this.logger.log(`[WEBHOOK] Detected provider: ${detected.provider} (confidence: ${detected.confidence})`);
    if (!this.isProduction) {
      this.logger.log(`[WEBHOOK] Normalized payload: ${JSON.stringify(normalized)}`);
    }

    // Extract or generate event ID for duplicate detection
    // For platforms like WooCommerce that may send separate webhooks per line item,
    // all with the same order ID, we append the productSku/productId to make the
    // eventId unique per line item while still deduplicating re-delivered webhooks.
    const baseEventId = normalized.eventId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const productComponent = normalized.productSku || normalized.productId || '';
    const eventId = productComponent ? `${baseEventId}-${productComponent}` : baseEventId;
    this.logger.log(`[WEBHOOK] Event ID: ${eventId}`);

    // Check for duplicate
    const existing = await this.prisma.incomingWebhook.findUnique({
      where: { eventId },
    });

    if (existing) {
      this.logger.log(`[WEBHOOK] Duplicate webhook event detected: ${eventId}`);
      return { success: true, message: 'Duplicate event ignored', eventId };
    }

    // Extract signature from common header patterns
    const signature =
      headers['x-shopify-hmac-sha256'] ||
      headers['x-wc-webhook-signature'] ||
      headers['stripe-signature'] ||
      headers['x-webhook-signature'] ||
      headers['x-signature'] ||
      null;

    // Store the webhook with full metadata — authenticated to this merchant
    const webhook = await this.prisma.incomingWebhook.create({
      data: {
        eventId,
        merchantId: merchant.id,
        platform: normalized.platform || 'unknown',
        provider: normalized.provider || null,
        orderId: normalized.orderId || null,
        productId: normalized.productId || null,
        productName: normalized.productName || null,
        productSku: normalized.productSku || null,
        productCategory: normalized.productCategory || null,
        customerName: normalized.customerName || null,
        customerEmail: normalized.customerEmail || null,
        quantity: normalized.quantity || null,
        amount: normalized.amount ? String(normalized.amount) : null,
        currency: normalized.currency || null,
        paymentStatus: normalized.paymentStatus || null,
        orderStatus: normalized.orderStatus || null,
        rawPayload: JSON.stringify(payload),
        rawHeaders: JSON.stringify(headers),
        signature: signature ? String(signature) : null,
        sourceIp: sourceIp || null,
        processingStatus: 'PENDING',
      },
    });

    this.logger.log(`[WEBHOOK] Webhook stored with ID: ${webhook.id}`);

    // Process the webhook asynchronously (serialized to prevent concurrent stock conflicts)
    // Pass the normalized payload (including lineItems) directly so we don't need
    // to re-parse rawPayload in the async processor.
    this.processingQueue = this.processingQueue
      .then(() => this.processWebhookAsync(webhook.id, normalized))
      .catch((err) => {
        this.logger.error(`[WEBHOOK] Failed to process webhook ${webhook.id}: ${err.message}`);
        this.logger.error(`[WEBHOOK] Error stack: ${err.stack}`);
      });

    return { success: true, message: 'Webhook received and queued for processing', webhookId: webhook.id, eventId };
  }

  private parseWebhookPayload(payload: any) {
    // Deprecated: use ProviderDetector.normalize instead
    // Kept for backward compatibility
    return {
      platform: payload.platform || payload.source || payload.provider || 'unknown',
      orderId: payload.order_id || payload.orderId || payload.id || payload.transaction_id,
      productId: payload.product_id || payload.productId || payload.sku || payload.item_id,
      productName: payload.product_name || payload.productName || payload.name || payload.title || payload.item_name,
      productSku: payload.sku || payload.product_sku || payload.item_sku,
      productCategory: payload.category || payload.product_category || payload.type,
      customerName: payload.customer_name || payload.customerName || payload.buyer_name || payload.payer_name,
      customerEmail: payload.customer_email || payload.customerEmail || payload.buyer_email || payload.payer_email || payload.email,
      quantity: payload.quantity || payload.qty || payload.amount || 1,
      amount: payload.amount || payload.price || payload.total || payload.value,
      currency: payload.currency || payload.currency_code || 'USD',
      paymentStatus: payload.payment_status || payload.status || payload.state || payload.payment_state,
      orderStatus: payload.order_status || payload.status || payload.state,
    };
  }

  private async syncConnectedProduct(webhook: any, merchantId: string): Promise<{ id: string; inventorySource: string | null } | null> {
    try {
      if (!merchantId) {
        this.logger.warn(`[WEBHOOK] No merchantId, skipping ConnectedProduct sync`);
        return null;
      }

      const platformProductId = webhook.productId || null;
      const platformSku = webhook.productSku || null;

      if (!platformProductId && !platformSku) {
        this.logger.warn(`[WEBHOOK] No platformProductId or platformSku, skipping ConnectedProduct sync`);
        return null;
      }

      // Check if connected product already exists.
      // IMPORTANT: When a SKU is available, search ONLY by SKU.
      // WooCommerce variable products share the same parent product_id across
      // all variations (e.g. PSN-USA-10, PSN-USA-50, PSN-USA-100 all have the
      // same product_id). Using OR with platformProductId would cause all
      // variations to share a single ConnectedProduct record, so the first
      // variation's auto-persisted denomination would be applied to ALL
      // subsequent variation orders.
      const whereClause: any = {
        merchantId,
        platform: webhook.platform,
      };
      if (platformSku) {
        whereClause.platformSku = platformSku;
      } else if (platformProductId) {
        whereClause.platformProductId = platformProductId;
      }

      const existing = await this.prisma.connectedProduct.findFirst({
        where: whereClause,
      });

      if (existing) {
        // Update existing
        await this.prisma.connectedProduct.update({
          where: { id: existing.id },
          data: {
            name: webhook.productName || existing.name,
            price: webhook.amount ? Number(webhook.amount) : existing.price,
            currency: webhook.currency || existing.currency,
            category: webhook.productCategory || existing.category,
            lastSyncedAt: new Date(),
          },
        });
        this.logger.log(`[WEBHOOK] Updated ConnectedProduct: ${existing.id}`);
        return { id: existing.id, inventorySource: existing.inventorySource };
      } else {
        // Create new — use upsert to handle race conditions where another
        // concurrent request creates the same record between our findFirst and create
        try {
          const created = await this.prisma.connectedProduct.create({
            data: {
              merchantId,
              platform: webhook.platform,
              provider: webhook.provider || null,
              // When a SKU is available, set platformProductId to null to avoid
              // unique constraint conflicts. WooCommerce variable products share
              // the same parent product_id across all variations (PSN-USA-10,
              // PSN-USA-50, etc.), so creating separate records per SKU would
              // violate @@unique([merchantId, platform, platformProductId]).
              // PostgreSQL treats NULLs as distinct, so no conflict.
              platformProductId: platformSku ? null : platformProductId,
              platformSku,
              name: webhook.productName || 'Unknown Product',
              sku: platformSku,
              category: webhook.productCategory,
              price: webhook.amount ? Number(webhook.amount) : null,
              currency: webhook.currency,
              status: 'ACTIVE',
              lastSyncedAt: new Date(),
            },
          });
          this.logger.log(`[WEBHOOK] Created ConnectedProduct for ${webhook.platform}: ${created.id}`);
          return { id: created.id, inventorySource: created.inventorySource };
        } catch (createErr: any) {
          // Unique constraint violation — record was created by a concurrent request
          // Re-fetch it and return it instead of failing
          if (createErr?.code === 'P2002') {
            this.logger.log(`[WEBHOOK] ConnectedProduct already exists (race condition), re-fetching`);
            const existingRetry = await this.prisma.connectedProduct.findFirst({
              where: whereClause,
            });
            if (existingRetry) {
              return { id: existingRetry.id, inventorySource: existingRetry.inventorySource };
            }
            // If still not found by primary whereClause, try by platformProductId only
            if (platformProductId) {
              const fallback = await this.prisma.connectedProduct.findFirst({
                where: { merchantId, platform: webhook.platform, platformProductId },
              });
              if (fallback) {
                return { id: fallback.id, inventorySource: fallback.inventorySource };
              }
            }
          }
          throw createErr;
        }
      }
    } catch (error) {
      this.logger.error(`[WEBHOOK] Error syncing ConnectedProduct: ${(error as Error).message}`);
      return null;
    }
  }

  private async processWebhookAsync(webhookId: string, normalizedData?: any) {
    this.logger.log(`[WEBHOOK] Processing webhook ${webhookId}`);
    try {
      const webhook = await this.prisma.incomingWebhook.findUnique({
        where: { id: webhookId },
      });

      if (!webhook) {
        throw new Error('Webhook not found');
      }

      this.logger.log(`[WEBHOOK] Webhook payment status: ${webhook.paymentStatus}`);

      // Only process if payment is successful
      const paidStatuses = ['paid', 'completed', 'success', 'succeeded', 'COMPLETED', 'PAID'];
      if (!webhook.paymentStatus || !paidStatuses.includes(webhook.paymentStatus)) {
        this.logger.log(`[WEBHOOK] Payment not successful (${webhook.paymentStatus}), skipping processing`);
        await this.prisma.incomingWebhook.update({
          where: { id: webhookId },
          data: {
            processingStatus: 'SKIPPED',
            errorMessage: `Payment not successful: ${webhook.paymentStatus}`,
            processedAt: new Date(),
          },
        });
        return;
      }

      // Deduplicate by orderId + productSku: if another webhook for the same order
      // AND same product SKU was already COMPLETED, skip. But allow different products
      // in the same order — WooCommerce may send separate webhooks per line item.
      if (webhook.orderId && webhook.merchantId) {
        const dedupeWhere: any = {
          orderId: webhook.orderId,
          merchantId: webhook.merchantId,
          processingStatus: 'COMPLETED',
          id: { not: webhookId },
        };
        // If this webhook has a productSku, only dedupe against webhooks with the same productSku
        if (webhook.productSku) {
          dedupeWhere.productSku = webhook.productSku;
        }
        const existingFulfilled = await this.prisma.incomingWebhook.findFirst({
          where: dedupeWhere,
        });
        if (existingFulfilled) {
          this.logger.log(`[WEBHOOK] Order ${webhook.orderId} product "${webhook.productSku || webhook.productName}" already fulfilled via webhook ${existingFulfilled.id}, skipping duplicate`);
          await this.prisma.incomingWebhook.update({
            where: { id: webhookId },
            data: {
              processingStatus: 'DUPLICATE_ORDER',
              errorMessage: `Order ${webhook.orderId} product "${webhook.productSku || webhook.productName}" already fulfilled via webhook ${existingFulfilled.id}`,
              processedAt: new Date(),
            },
          });
          return;
        }
      }

      // Find merchant: must be set from webhook authentication
      let merchantId = webhook.merchantId;

      if (!merchantId) {
        // Try to find merchant from product mapping as fallback
        let product = null;
        if (webhook.productId) {
          product = await this.prisma.product.findFirst({
            where: {
              OR: [
                { id: webhook.productId },
                { name: { contains: webhook.productName || '' } },
              ],
            },
          });
        } else if (webhook.productName) {
          product = await this.prisma.product.findFirst({
            where: { name: { contains: webhook.productName } },
          });
        }

        if (product?.merchantId) {
          merchantId = product.merchantId;
        } else {
          // No merchant could be determined — reject instead of using a random merchant
          this.logger.error(`[WEBHOOK] No merchant associated with webhook ${webhookId} and no product match found`);
          await this.prisma.incomingWebhook.update({
            where: { id: webhookId },
            data: {
              processingStatus: 'FAILED',
              errorMessage: 'No merchant associated with this webhook',
              processedAt: new Date(),
            },
          });
          return;
        }
      }

      // ─── Multi-line-item detection ───
      // Use normalizedData.lineItems if available (passed from processIncomingWebhook),
      // otherwise fall back to parsing rawPayload.
      try {
        let allLineItems: any[] = [];
        if (normalizedData?.lineItems && Array.isArray(normalizedData.lineItems) && normalizedData.lineItems.length > 0) {
          allLineItems = normalizedData.lineItems;
          this.logger.log(`[WEBHOOK] Using normalized lineItems: ${allLineItems.length} item(s)`);
        } else {
          const rawPayload = JSON.parse(webhook.rawPayload || '{}');
          this.logger.log(`[WEBHOOK] Raw payload top-level keys: [${Object.keys(rawPayload).join(',')}]`);
          const order = rawPayload.order || rawPayload.data || rawPayload;
          allLineItems = order?.line_items || [];
          this.logger.log(`[WEBHOOK] Parsed from rawPayload: ${allLineItems.length} item(s)`);
        }

        this.logger.log(`[WEBHOOK] Line item check: ${allLineItems.length} item(s) found`);

        if (allLineItems.length > 1) {
          this.logger.log(`[WEBHOOK] Multi-item order detected (${allLineItems.length} items) — processing ALL items in unified loop`);

          let successCount = 0;
          let failCount = 0;

          for (let liIndex = 0; liIndex < allLineItems.length; liIndex++) {
            try {
              const li = allLineItems[liIndex];
              // Support both normalized format (productSku, productName, productId, variationId)
              // and raw WooCommerce format (sku, name, product_id, variation_id)
              const liSku = li?.productSku || li?.sku || '';
              const liName = li?.productName || li?.name || li?.title || '';
              const liProductId = String(li?.productId || li?.product_id || '');
              const liQuantity = li?.quantity || 1;
              const liVariationId = String(li?.variationId || li?.variation_id || '');

              this.logger.log(`[WEBHOOK] Processing line item ${liIndex + 1}/${allLineItems.length}: SKU=${liSku}, name=${liName}, qty=${liQuantity}, variationId=${liVariationId}`);

              // Sync ConnectedProduct for this line item
              const liSyncData = {
                platform: webhook.platform,
                provider: webhook.provider,
                productId: liProductId,
                productName: liName,
                productSku: liSku,
                productCategory: null,
                amount: null,
                currency: webhook.currency,
              };
              const liConnectedProduct = await this.syncConnectedProduct(liSyncData, merchantId);
              const liInventorySource = liConnectedProduct?.inventorySource || 'AUTO';

              // Product matching — same strategies as single-item path
              let liProduct = null;
              let liExactDenominationId: string | null = null;
              let liVariantId: string | null = null;

              // Strategy 1: ConnectedProduct by SKU
              let liCpMapping: any = null;
              if (merchantId && liSku) {
                liCpMapping = await this.prisma.connectedProduct.findFirst({
                  where: { merchantId, platform: webhook.platform, platformSku: liSku },
                });
              }
              if (!liCpMapping?.dcvProductId && merchantId && liProductId && !liSku) {
                liCpMapping = await this.prisma.connectedProduct.findFirst({
                  where: { merchantId, platform: webhook.platform, platformProductId: liProductId },
                });
              }
              if (liCpMapping?.dcvProductId) {
                liProduct = await this.prisma.product.findUnique({ where: { id: liCpMapping.dcvProductId } });
                if (liCpMapping.dcvDenominationId) liExactDenominationId = liCpMapping.dcvDenominationId;
                this.logger.log(`[WEBHOOK] Item ${liIndex + 1}: Strategy 1 matched via ConnectedProduct (SKU: ${liSku})`);
              } else {
                this.logger.log(`[WEBHOOK] Item ${liIndex + 1}: Strategy 1 no mapping for SKU: ${liSku}`);
              }

              // Strategy 2: Exact SKU match
              if (!liProduct && liSku) {
                liProduct = await this.prisma.product.findFirst({ where: { sku: liSku, status: 'ACTIVE' } });
                if (liProduct) this.logger.log(`[WEBHOOK] Item ${liIndex + 1}: Strategy 2 matched by exact SKU: ${liSku}`);
              }

              // Strategy 2a: Stored SKU on a code value or a pack.
              if (!liProduct && liSku) {
                const resolved = await this.resolveSku(liSku);
                if (resolved) {
                  liProduct = resolved.product;
                  if (resolved.denominationId) liExactDenominationId = resolved.denominationId;
                  if (resolved.variantId) liVariantId = resolved.variantId;
                  this.logger.log(
                    `[WEBHOOK] Line item ${liIndex + 1}: matched by ${resolved.matchedOn}: ${liSku}`,
                  );
                }
              }

              // Strategy 2b: Denomination SKU match (PSN-USA-150 → product PSN-USA, denom $150)
              if (!liProduct && liSku) {
                const lastDash = liSku.lastIndexOf('-');
                if (lastDash > 0) {
                  const prefixSku = liSku.substring(0, lastDash);
                  const faceValueNum = parseFloat(liSku.substring(lastDash + 1));
                  if (!isNaN(faceValueNum) && faceValueNum > 0) {
                    const prefixProduct = await this.prisma.product.findFirst({
                      where: { sku: prefixSku, status: 'ACTIVE' },
                      include: { denominations: { orderBy: { faceValue: 'asc' } } },
                    });
                    if (prefixProduct) {
                      this.logger.log(`[WEBHOOK] Item ${liIndex + 1}: Strategy 2b found product by prefix "${prefixSku}" — looking for $${faceValueNum}`);
                      const matchedDenom = prefixProduct.denominations.find((d: any) => Number(d.faceValue) === faceValueNum);
                      if (matchedDenom) {
                        liProduct = prefixProduct;
                        liExactDenominationId = matchedDenom.id;
                        this.logger.log(`[WEBHOOK] Item ${liIndex + 1}: Strategy 2b matched denomination $${faceValueNum}`);
                      } else {
                        this.logger.warn(`[WEBHOOK] Item ${liIndex + 1}: Strategy 2b no denomination $${faceValueNum}. Available: [${prefixProduct.denominations.map((d: any) => d.faceValue).join(', ')}]`);
                      }
                    } else {
                      this.logger.warn(`[WEBHOOK] Item ${liIndex + 1}: Strategy 2b no product with SKU prefix "${prefixSku}"`);
                    }
                  }
                }
              }

              // Strategy 3: Exact name match
              if (!liProduct && liName) {
                liProduct = await this.prisma.product.findFirst({ where: { name: { equals: liName } } }) || null;
                if (liProduct) this.logger.log(`[WEBHOOK] Item ${liIndex + 1}: Strategy 3 matched by name: "${liName}"`);
              }

              if (!liProduct) {
                this.logger.warn(`[WEBHOOK] Item ${liIndex + 1}: No product mapping found for SKU "${liSku}" or name "${liName}". Skipping.`);
                failCount++;
                continue;
              }

              // Determine fulfillment amount
              let liFulfillmentAmount = 0;
              let liFulfillmentDenominationId: string | null = liExactDenominationId;

              if (liCpMapping?.dcvDenominationId) {
                const mappedDenom = await this.prisma.denomination.findUnique({ where: { id: liCpMapping.dcvDenominationId } });
                if (mappedDenom) {
                  liFulfillmentAmount = Number(mappedDenom.faceValue) * liQuantity;
                  liFulfillmentDenominationId = mappedDenom.id;
                }
              } else if (liProduct) {
                const liDenoms = await this.prisma.denomination.findMany({ where: { productId: liProduct.id }, orderBy: { faceValue: 'asc' } });
                if (liExactDenominationId) {
                  const exactDenom = liDenoms.find((d: any) => d.id === liExactDenominationId);
                  if (exactDenom) {
                    liFulfillmentAmount = Number(exactDenom.faceValue) * liQuantity;
                    liFulfillmentDenominationId = exactDenom.id;
                  }
                }
                if (liFulfillmentAmount <= 0 && liDenoms.length === 1) {
                  liFulfillmentAmount = Number(liDenoms[0].faceValue) * liQuantity;
                  liFulfillmentDenominationId = liDenoms[0].id;
                } else if (liFulfillmentAmount <= 0 && liDenoms.length > 1) {
                  liFulfillmentAmount = Number(liDenoms[0].faceValue) * liQuantity;
                  liFulfillmentDenominationId = liDenoms[0].id;
                  this.logger.warn(`[WEBHOOK] Item ${liIndex + 1}: multiple denominations, using smallest: $${Number(liDenoms[0].faceValue)} × ${liQuantity}`);
                }
              }

              if (liFulfillmentAmount <= 0) {
                this.logger.warn(`[WEBHOOK] Item ${liIndex + 1}: Could not determine fulfillment amount for "${liProduct.name}". Skipping.`);
                failCount++;
                continue;
              }

              this.logger.log(`[WEBHOOK] Item ${liIndex + 1}: Creating fulfillment for "${liProduct.name}" — $${liFulfillmentAmount} USD (qty: ${liQuantity})`);

              // Create one fulfillment per quantity unit, each with its own idempotency key.
              // This ensures quantity > 1 on a single line item produces N separate code allocations.
              for (let qtyIndex = 0; qtyIndex < liQuantity; qtyIndex++) {
                let liFulfillmentResult: any;
                const MAX_RETRIES = 3;
                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                  try {
                    liFulfillmentResult = await this.fulfillmentService.createFulfillment({
                      merchantId,
                      productId: liProduct.id,
                      amount: liFulfillmentAmount / liQuantity,
                      currency: 'USD',
                      referenceId: webhook.orderId || undefined,
                      idempotencyKey: `webhook-${webhook.eventId}-item-${liIndex}-qty-${qtyIndex}`,
                      customerEmail: webhook.customerEmail || undefined,
                      customerName: webhook.customerName || undefined,
                      actorType: 'SYSTEM',
                      actorId: 'webhook-processor',
                      inventorySource: liInventorySource,
                      denominationId: liFulfillmentDenominationId || undefined,
                      variantId: liCpMapping?.dcvVariantId || liVariantId || undefined,
                    });
                    break;
                  } catch (err: any) {
                    const isRetryable = err?.response?.code === 'STOCK_CONFLICT' ||
                      err?.response?.code === 'INSUFFICIENT_STOCK' ||
                      err?.message?.includes('Transaction already closed');
                    if (isRetryable && attempt < MAX_RETRIES) {
                      this.logger.warn(`[WEBHOOK] Item ${liIndex + 1} qty ${qtyIndex + 1}: Fulfillment conflict on attempt ${attempt}, retrying...`);
                      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                      continue;
                    }
                    throw err;
                  }
                }

                this.logger.log(`[WEBHOOK] Item ${liIndex + 1} qty ${qtyIndex + 1}/${liQuantity}: Fulfillment created: ${liFulfillmentResult.fulfillment_id}`);
                successCount++;

                this.queueWebhookEvent(merchantId, 'order.fulfilled', {
                  orderId: webhook.orderId,
                  fulfillmentId: liFulfillmentResult.fulfillment_id,
                  productId: liProduct.id,
                  productName: liProduct.name,
                  customerEmail: webhook.customerEmail,
                });
              }
            } catch (itemError) {
              failCount++;
              this.logger.error(`[WEBHOOK] Item ${liIndex + 1} failed: ${(itemError as Error).message} — continuing with remaining items.`);
            }
          }

          // Update webhook status after all items are processed
          await this.prisma.incomingWebhook.update({
            where: { id: webhookId },
            data: {
              merchantId,
              processingStatus: successCount > 0 ? 'COMPLETED' : 'FAILED',
              responseCode: 200,
              processedAt: new Date(),
              errorMessage: failCount > 0 ? `${failCount} of ${allLineItems.length} items failed` : null,
            },
          });

          this.logger.log(`[WEBHOOK] Multi-item processing complete: ${successCount} succeeded, ${failCount} failed out of ${allLineItems.length} items`);
          return;
        }
      } catch (multiDetectError) {
        this.logger.warn(`[WEBHOOK] Multi-line-item detection failed: ${(multiDetectError as Error).message} — falling through to single-item processing`);
      }

      // ─── Single-item processing (existing code path) ───
      // Sync to ConnectedProduct BEFORE product matching
      const syncData = {
        platform: webhook.platform,
        provider: webhook.provider,
        productId: webhook.productId,
        productName: webhook.productName,
        productSku: webhook.productSku,
        productCategory: webhook.productCategory,
        amount: webhook.amount ? Number(webhook.amount) : null,
        currency: webhook.currency,
      };
      const connectedProduct = await this.syncConnectedProduct(syncData, merchantId);

      // Determine inventory source from ConnectedProduct (default to AUTO)
      const inventorySource = connectedProduct?.inventorySource || 'AUTO';

      // Find local product — SKU mapping is primary, fuzzy matching is fallback
      this.logger.log(`[WEBHOOK] Looking for product: ${webhook.productName || webhook.productId} (SKU: ${webhook.productSku || 'N/A'})`);
      let product = null;
      let exactDenominationId: string | null = null;
      // Set when the SKU resolved to a pack, so its delivery rule is used.
      let matchedVariantId: string | null = null;
      const searchName = webhook.productName || '';
      const searchId = webhook.productId || '';
      const searchSku = webhook.productSku || '';

      // Strategy 1: ConnectedProduct.dcvProductId (PRIMARY — explicit admin mapping)
      // Matches by SKU first (most specific), then falls back to platformProductId.
      // This mirrors the same lookup keys used by syncConnectedProduct() so that any
      // mapping an admin sets via the Connected Products dashboard is actually found,
      // even when the source platform (e.g. WooCommerce) sends no SKU.
      let cpMapping: { dcvProductId: string | null; dcvDenominationId: string | null; dcvVariantId: string | null } | null = null;
      let matchedVia = '';

      if (merchantId && searchSku) {
        cpMapping = await this.prisma.connectedProduct.findFirst({
          where: { merchantId, platform: webhook.platform, platformSku: searchSku },
        });
        if (cpMapping?.dcvProductId) matchedVia = `SKU: ${searchSku}`;
      }

      // Only fall back to platformProductId when no SKU was available.
      // WooCommerce variable products share the same parent product_id across
      // all variations, so looking up by platformProductId when a SKU exists
      // but has no mapping would find a DIFFERENT variation's ConnectedProduct
      // — returning the wrong denomination.
      if (!cpMapping?.dcvProductId && merchantId && searchId && !searchSku) {
        cpMapping = await this.prisma.connectedProduct.findFirst({
          where: { merchantId, platform: webhook.platform, platformProductId: searchId },
        });
        if (cpMapping?.dcvProductId) matchedVia = `platformProductId: ${searchId}`;
      }

      if (cpMapping?.dcvProductId) {
        product = await this.prisma.product.findUnique({ where: { id: cpMapping.dcvProductId } });
        if (product) {
          this.logger.log(`[WEBHOOK] Matched product "${product.name}" via explicit ConnectedProduct mapping (${matchedVia} → dcvProductId: ${cpMapping.dcvProductId})`);
          if (cpMapping.dcvDenominationId) {
            exactDenominationId = cpMapping.dcvDenominationId;
            this.logger.log(`[WEBHOOK] Exact denomination mapping: ${exactDenominationId}`);
          }
          if (cpMapping.dcvVariantId) {
            this.logger.log(`[WEBHOOK] Variant mapping: ${cpMapping.dcvVariantId}`);
          }
        }
      }

      // Strategy 2: Exact SKU auto-match (PRIMARY for new products)
      // If the webhook carries a product_sku, look up a DCV Product with a matching
      // sku field. If found, auto-populate the ConnectedProduct's dcvProductId so
      // future orders for this product skip this lookup entirely.
      if (!product && searchSku) {
        const skuMatch = await this.prisma.product.findFirst({
          where: { sku: searchSku, status: 'ACTIVE' },
        });
        if (skuMatch) {
          product = skuMatch;
          this.logger.log(`[WEBHOOK] Auto-matched product "${product.name}" via SKU: ${searchSku}`);
          // Persist the auto-match on the ConnectedProduct so future orders use Strategy 1
          if (connectedProduct?.id) {
            await this.prisma.connectedProduct.update({
              where: { id: connectedProduct.id },
              data: { dcvProductId: product.id },
            }).catch((err) => {
              this.logger.warn(`[WEBHOOK] Failed to persist SKU auto-match on ConnectedProduct: ${(err as Error).message}`);
            });
          }
        }
      }

      // Strategy 2a: Stored SKU on a code value or a pack.
      if (!product && searchSku) {
        const resolved = await this.resolveSku(searchSku);
        if (resolved) {
          product = resolved.product;
          if (resolved.denominationId) exactDenominationId = resolved.denominationId;
          if (resolved.variantId) matchedVariantId = resolved.variantId;
          this.logger.log(
            `[WEBHOOK] Auto-matched product "${product.name}" via ${resolved.matchedOn}: ${searchSku}`,
          );
          if (connectedProduct?.id) {
            await this.prisma.connectedProduct.update({
              where: { id: connectedProduct.id },
              data: {
                dcvProductId: product.id,
                ...(resolved.denominationId ? { dcvDenominationId: resolved.denominationId } : {}),
                ...(resolved.variantId ? { dcvVariantId: resolved.variantId } : {}),
              },
            }).catch((err) => {
              this.logger.warn(`[WEBHOOK] Failed to persist SKU auto-match: ${(err as Error).message}`);
            });
          }
        }
      }

      // Strategy 2b: Denomination SKU match (computed)
      // Incoming SKU like "PSN-KSA-10" — try to split off the last segment as a face value,
      // match the product by the prefix as Product.sku, then find the denomination by faceValue.
      if (!product && searchSku) {
        const lastDash = searchSku.lastIndexOf('-');
        if (lastDash > 0) {
          const prefixSku = searchSku.substring(0, lastDash);
          const faceValueStr = searchSku.substring(lastDash + 1);
          const faceValueNum = parseFloat(faceValueStr);

          if (!isNaN(faceValueNum) && faceValueNum > 0) {
            // Try matching the prefix as a Product.sku
            const prefixProduct = await this.prisma.product.findFirst({
              where: { sku: prefixSku, status: 'ACTIVE' },
              include: { denominations: { orderBy: { faceValue: 'asc' } } },
            });

            if (prefixProduct) {
              // Find the denomination matching this face value
              const matchedDenom = prefixProduct.denominations.find(
                (d) => Number(d.faceValue) === faceValueNum,
              );

              if (matchedDenom) {
                product = prefixProduct;
                exactDenominationId = matchedDenom.id;
                this.logger.log(`[WEBHOOK] Auto-matched product "${product.name}" via denomination SKU: ${searchSku} (prefix: ${prefixSku}, faceValue: ${faceValueNum})`);
                // Persist the auto-match on the ConnectedProduct so future orders use Strategy 1
                if (connectedProduct?.id) {
                  await this.prisma.connectedProduct.update({
                    where: { id: connectedProduct.id },
                    data: { dcvProductId: product.id, dcvDenominationId: matchedDenom.id },
                  }).catch((err) => {
                    this.logger.warn(`[WEBHOOK] Failed to persist denomination SKU auto-match on ConnectedProduct: ${(err as Error).message}`);
                  });
                }
              } else {
                this.logger.warn(`[WEBHOOK] SKU prefix "${prefixSku}" matched product "${prefixProduct.name}" but no denomination with faceValue ${faceValueNum} found`);
              }
            }
          }
        }
      }

      // Strategy 3: Exact UUID match (rarely matches for WooCommerce)
      if (!product && searchId) {
        product = await this.prisma.product.findUnique({ where: { id: searchId } });
        if (product) {
          this.logger.log(`[WEBHOOK] Matched product "${product.name}" via exact ID match`);
        }
      }

      // Strategy 4: Exact name match (case-insensitive) — safe, no fuzzy guessing
      if (!product && searchName) {
        product = await this.prisma.product.findFirst({
          where: { name: { equals: searchName } },
        }) || null;
        if (product) {
          this.logger.log(`[WEBHOOK] Matched product "${product.name}" via exact name match (case-insensitive)`);
        }
      }

      // SAFETY: No fuzzy/keyword/alias matching. Unmapped products are rejected.
      if (!product) {
        const errMsg = `No explicit product mapping found for SKU "${searchSku}" or name "${searchName}". ` +
          `ConnectedProduct synced but no dcvProductId mapped. ` +
          `Fulfillment rejected — no wallet debit, no inventory allocation. ` +
          `Admin must map this product in the Connected Products dashboard.`;
        this.logger.warn(`[WEBHOOK] ${errMsg}`);

        await this.prisma.incomingWebhook.update({
          where: { id: webhookId },
          data: {
            merchantId,
            processingStatus: 'REJECTED',
            errorMessage: errMsg,
            processedAt: new Date(),
          },
        });

        // Notify admin via audit log
        await this.prisma.auditLog.create({
          data: {
            actorType: 'SYSTEM',
            actorId: 'webhook-processor',
            action: 'webhook.product_unmapped',
            entity: 'IncomingWebhook',
            entityId: webhookId,
            metadata: JSON.stringify({
              merchantId,
              productSku: searchSku,
              productName: searchName,
              orderId: webhook.orderId,
            }),
          },
        });

        return;
      }

      this.logger.log(`[WEBHOOK] Product found: ${product.id} - ${product.name}`);

      // Use FulfillmentService for proper order processing
      // Currency-agnostic: the order amount/currency from the webhook is irrelevant.
      // The denomination is determined by the ConnectedProduct mapping, not the order amount.
      const webhookAmount = webhook.amount ? Number(webhook.amount) : 0;
      const rawCurrency = (webhook.currency || 'USD').toUpperCase();

      if (rawCurrency !== 'USD') {
        this.logger.log(`[WEBHOOK] Incoming currency is ${rawCurrency}, amount ${webhookAmount} — denomination will be determined by product mapping, not order amount`);
      }

      // Determine the fulfillment amount from the mapped denomination, not the order amount.
      // The order amount/currency from the webhook may be in PKR or another non-USD currency,
      // so we must NEVER use it directly for denomination matching unless it's USD and matches.
      const orderQuantity = (webhook as any).quantity ? Number((webhook as any).quantity) : 1;
      let fulfillmentAmount = 0;
      let fulfillmentDenominationId: string | null = exactDenominationId;

      if (cpMapping?.dcvDenominationId) {
        // Explicit denomination mapping — use it directly × quantity
        const mappedDenom = await this.prisma.denomination.findUnique({
          where: { id: cpMapping.dcvDenominationId },
        });
        if (mappedDenom) {
          fulfillmentAmount = Number(mappedDenom.faceValue) * orderQuantity;
          fulfillmentDenominationId = mappedDenom.id;
          this.logger.log(`[WEBHOOK] Using mapped denomination: $${Number(mappedDenom.faceValue)} × ${orderQuantity} qty = $${fulfillmentAmount} (denomination ID: ${cpMapping.dcvDenominationId})`);
        }
      } else if (cpMapping?.dcvProductId && product) {
        // No specific denomination mapped — use the product's denominations
        const productDenoms = await this.prisma.denomination.findMany({
          where: { productId: product.id },
          orderBy: { faceValue: 'asc' },
        });
        if (productDenoms.length === 1) {
          // Single denomination — use it × quantity
          fulfillmentAmount = Number(productDenoms[0].faceValue) * orderQuantity;
          fulfillmentDenominationId = productDenoms[0].id;
          this.logger.log(`[WEBHOOK] Product has single denomination: $${Number(productDenoms[0].faceValue)} × ${orderQuantity} qty = $${fulfillmentAmount}`);
        } else if (productDenoms.length > 1) {
          // Multiple denominations — only try amount match if currency is USD
          if (rawCurrency === 'USD' && webhookAmount > 0) {
            const matchByAmount = productDenoms.find((d) => Number(d.faceValue) === webhookAmount);
            if (matchByAmount) {
              fulfillmentAmount = Number(matchByAmount.faceValue) * orderQuantity;
              fulfillmentDenominationId = matchByAmount.id;
              this.logger.log(`[WEBHOOK] Matched denomination by USD amount: $${Number(matchByAmount.faceValue)} × ${orderQuantity} qty = $${fulfillmentAmount}`);
            }
          }
          if (fulfillmentAmount <= 0) {
            // Non-USD currency or no USD amount match — use quantity × smallest denomination
            // Admin should map a specific denomination to avoid this fallback
            fulfillmentAmount = Number(productDenoms[0].faceValue) * orderQuantity;
            fulfillmentDenominationId = productDenoms[0].id;
            this.logger.warn(`[WEBHOOK] Product has multiple denominations, could not match by amount (${webhookAmount} ${rawCurrency}). Using smallest: $${Number(productDenoms[0].faceValue)} × ${orderQuantity} qty = $${fulfillmentAmount}. Admin should map a specific denomination.`);
          }
        }
      } else if (product) {
        // Product matched via Strategy 2/3/4 (SKU or name) — no ConnectedProduct mapping
        const productDenoms = await this.prisma.denomination.findMany({
          where: { productId: product.id },
          orderBy: { faceValue: 'asc' },
        });
        if (exactDenominationId) {
          // Strategy 2b already matched a specific denomination from the SKU
          // (e.g. PSN-USA-100 → $100 denomination). Use it directly.
          const exactDenom = productDenoms.find((d) => d.id === exactDenominationId);
          if (exactDenom) {
            fulfillmentAmount = Number(exactDenom.faceValue) * orderQuantity;
            fulfillmentDenominationId = exactDenom.id;
            this.logger.log(`[WEBHOOK] Using exact denomination from SKU match: $${Number(exactDenom.faceValue)} × ${orderQuantity} qty = $${fulfillmentAmount}`);
          } else {
            this.logger.warn(`[WEBHOOK] exactDenominationId ${exactDenominationId} not found in product denominations — falling back`);
          }
        }
        if (fulfillmentAmount <= 0 && productDenoms.length === 1) {
          fulfillmentAmount = Number(productDenoms[0].faceValue) * orderQuantity;
          fulfillmentDenominationId = productDenoms[0].id;
          this.logger.log(`[WEBHOOK] Product matched via SKU/name, single denomination: $${Number(productDenoms[0].faceValue)} × ${orderQuantity} qty = $${fulfillmentAmount}`);
        } else if (fulfillmentAmount <= 0 && productDenoms.length > 1) {
          if (rawCurrency === 'USD' && webhookAmount > 0) {
            const matchByAmount = productDenoms.find((d) => Number(d.faceValue) === webhookAmount);
            if (matchByAmount) {
              fulfillmentAmount = Number(matchByAmount.faceValue) * orderQuantity;
              fulfillmentDenominationId = matchByAmount.id;
              this.logger.log(`[WEBHOOK] Product matched via SKU/name, denomination by USD amount: $${Number(matchByAmount.faceValue)} × ${orderQuantity} qty = $${fulfillmentAmount}`);
            }
          }
          if (fulfillmentAmount <= 0) {
            fulfillmentAmount = Number(productDenoms[0].faceValue) * orderQuantity;
            fulfillmentDenominationId = productDenoms[0].id;
            this.logger.warn(`[WEBHOOK] Product matched via SKU/name, multiple denominations, using smallest: $${Number(productDenoms[0].faceValue)} × ${orderQuantity} qty = $${fulfillmentAmount}`);
          }
        }
      }

      if (fulfillmentAmount <= 0) {
        const errMsg = `Could not determine fulfillment amount for product "${product?.name}". ` +
          `No denomination mapped and order amount is ${webhookAmount} ${rawCurrency}. ` +
          `Admin must map a denomination in the Connected Products dashboard.`;
        this.logger.warn(`[WEBHOOK] ${errMsg}`);

        await this.prisma.incomingWebhook.update({
          where: { id: webhookId },
          data: { merchantId, processingStatus: 'REJECTED', errorMessage: errMsg, processedAt: new Date() },
        });
        return;
      }

      this.logger.log(`[WEBHOOK] Creating fulfillment via FulfillmentService for merchant ${merchantId} (fulfillment amount: ${fulfillmentAmount} USD, order amount: ${webhookAmount} ${rawCurrency}, qty: ${orderQuantity})`);

      // Create one fulfillment per quantity unit, each with its own idempotency key.
      const perUnitAmount = fulfillmentAmount / orderQuantity;
      for (let qtyIndex = 0; qtyIndex < orderQuantity; qtyIndex++) {
        let fulfillmentResult: any;
        const MAX_WEBHOOK_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_WEBHOOK_RETRIES; attempt++) {
          try {
            fulfillmentResult = await this.fulfillmentService.createFulfillment({
              merchantId,
              productId: product.id,
              amount: perUnitAmount,
              currency: 'USD',
              referenceId: webhook.orderId || undefined,
              idempotencyKey: `webhook-${webhook.eventId}-qty-${qtyIndex}`,
              customerEmail: webhook.customerEmail || undefined,
              customerName: webhook.customerName || undefined,
              actorType: 'SYSTEM',
              actorId: 'webhook-processor',
              inventorySource,
              denominationId: fulfillmentDenominationId || undefined,
              variantId: cpMapping?.dcvVariantId || matchedVariantId || undefined,
            });
            break;
          } catch (err: any) {
            const isRetryable = err?.response?.code === 'STOCK_CONFLICT' ||
              err?.response?.code === 'INSUFFICIENT_STOCK' ||
              err?.message?.includes('Transaction already closed');
            if (isRetryable && attempt < MAX_WEBHOOK_RETRIES) {
              this.logger.warn(`[WEBHOOK] Fulfillment conflict on attempt ${attempt} (qty ${qtyIndex + 1}/${orderQuantity}), retrying in ${500 * attempt}ms...`);
              await new Promise(resolve => setTimeout(resolve, 500 * attempt));
              continue;
            }
            throw err;
          }
        }

        this.logger.log(`[WEBHOOK] Fulfillment created: ${fulfillmentResult.fulfillment_id} (qty ${qtyIndex + 1}/${orderQuantity})`);

        // Trigger outgoing webhook notification for each fulfillment
        this.queueWebhookEvent(merchantId, 'order.fulfilled', {
          orderId: webhook.orderId,
          fulfillmentId: fulfillmentResult.fulfillment_id,
          productId: product.id,
          productName: product.name,
          customerEmail: webhook.customerEmail,
        });
      }

      // Update webhook status
      await this.prisma.incomingWebhook.update({
        where: { id: webhookId },
        data: {
          merchantId,
          processingStatus: 'COMPLETED',
          responseCode: 200,
          processedAt: new Date(),
        },
      });

      this.logger.log(`[WEBHOOK] Successfully processed webhook ${webhookId} (${orderQuantity} fulfillment(s) for line item 1)`);

      // ─── Multi-line-item processing (FALLBACK) ───
      // This only runs if the unified multi-item detection at the top didn't trigger
      // (e.g. payload structure wasn't detected). The first line item was already
      // processed above; try to process the rest now.
      try {
        const rawPayload = JSON.parse(webhook.rawPayload || '{}');
        const order = rawPayload.order || rawPayload.data || rawPayload;
        const allLineItems = order?.line_items || [];

        this.logger.log(`[WEBHOOK] Multi-line-item fallback check: rawPayload keys=[${Object.keys(rawPayload).join(',')}] order keys=[${Object.keys(order || {}).join(',')}] line_items count=${allLineItems.length}`);

        if (allLineItems.length > 1) {
          this.logger.log(`[WEBHOOK] Order has ${allLineItems.length} line items — processing remaining ${allLineItems.length - 1} item(s)`);

          for (let liIndex = 1; liIndex < allLineItems.length; liIndex++) {
            // Each line item gets its own error boundary so that one failure
            // (out of stock, unmapped product, ...) does not prevent the
            // remaining items in the order from being fulfilled.
            try {
            const li = allLineItems[liIndex];
            const liSku = li?.productSku || li?.sku || '';
            const liName = li?.productName || li?.name || li?.title || '';
            const liProductId = String(li?.productId || li?.product_id || '');
            const liQuantity = li?.quantity || 1;

            this.logger.log(`[WEBHOOK] Processing line item ${liIndex + 1}/${allLineItems.length}: SKU=${liSku}, name=${liName}, qty=${liQuantity}`);

            // Match product for this line item
            let liProduct = null;
            let liExactDenominationId: string | null = null;
              let liVariantId: string | null = null;

            // Strategy 1: ConnectedProduct mapping by SKU
            let liCpMapping: any = null;
            if (merchantId && liSku) {
              liCpMapping = await this.prisma.connectedProduct.findFirst({
                where: { merchantId, platform: webhook.platform, platformSku: liSku },
              });
            }
            // Only fall back to platformProductId when no SKU was available
            if (!liCpMapping?.dcvProductId && merchantId && liProductId && !liSku) {
              liCpMapping = await this.prisma.connectedProduct.findFirst({
                where: { merchantId, platform: webhook.platform, platformProductId: liProductId },
              });
            }
            if (liCpMapping?.dcvProductId) {
              liProduct = await this.prisma.product.findUnique({ where: { id: liCpMapping.dcvProductId } });
              if (liCpMapping.dcvDenominationId) liExactDenominationId = liCpMapping.dcvDenominationId;
              this.logger.log(`[WEBHOOK] Line item ${liIndex + 1}: Strategy 1 matched product via ConnectedProduct (SKU: ${liSku})`);
            } else {
              this.logger.log(`[WEBHOOK] Line item ${liIndex + 1}: Strategy 1 no ConnectedProduct mapping for SKU: ${liSku}`);
            }

            // Strategy 2: Exact SKU match
            if (!liProduct && liSku) {
              liProduct = await this.prisma.product.findFirst({ where: { sku: liSku, status: 'ACTIVE' } });
              if (liProduct) this.logger.log(`[WEBHOOK] Line item ${liIndex + 1}: Strategy 2 matched product by exact SKU: ${liSku}`);
            }

            // Strategy 2a: Stored SKU on a code value or a pack.
            if (!liProduct && liSku) {
              const resolved = await this.resolveSku(liSku);
              if (resolved) {
                liProduct = resolved.product;
                if (resolved.denominationId) liExactDenominationId = resolved.denominationId;
                if (resolved.variantId) liVariantId = resolved.variantId;
                this.logger.log(
                  `[WEBHOOK] Line item ${liIndex + 1}: matched by ${resolved.matchedOn}: ${liSku}`,
                );
              }
            }

            // Strategy 2b: Denomination SKU match (e.g. PSN-USA-100 → product PSN-USA, denom $100)
            if (!liProduct && liSku) {
              const lastDash = liSku.lastIndexOf('-');
              if (lastDash > 0) {
                const prefixSku = liSku.substring(0, lastDash);
                const faceValueNum = parseFloat(liSku.substring(lastDash + 1));
                if (!isNaN(faceValueNum) && faceValueNum > 0) {
                  const prefixProduct = await this.prisma.product.findFirst({
                    where: { sku: prefixSku, status: 'ACTIVE' },
                    include: { denominations: { orderBy: { faceValue: 'asc' } } },
                  });
                  if (prefixProduct) {
                    this.logger.log(`[WEBHOOK] Line item ${liIndex + 1}: Strategy 2b found product by prefix SKU "${prefixSku}" — looking for denomination $${faceValueNum}`);
                    const matchedDenom = prefixProduct.denominations.find((d: any) => Number(d.faceValue) === faceValueNum);
                    if (matchedDenom) {
                      liProduct = prefixProduct;
                      liExactDenominationId = matchedDenom.id;
                      this.logger.log(`[WEBHOOK] Line item ${liIndex + 1}: Strategy 2b matched denomination $${faceValueNum} → product "${prefixProduct.name}"`);
                    } else {
                      this.logger.warn(`[WEBHOOK] Line item ${liIndex + 1}: Strategy 2b found product "${prefixProduct.name}" but no denomination with faceValue $${faceValueNum}. Available: [${prefixProduct.denominations.map((d: any) => d.faceValue).join(', ')}]`);
                    }
                  } else {
                    this.logger.warn(`[WEBHOOK] Line item ${liIndex + 1}: Strategy 2b no product found with SKU prefix "${prefixSku}"`);
                  }
                }
              }
            }

            // Strategy 3: Exact name match
            if (!liProduct && liName) {
              liProduct = await this.prisma.product.findFirst({ where: { name: { equals: liName } } }) || null;
              if (liProduct) this.logger.log(`[WEBHOOK] Line item ${liIndex + 1}: Strategy 3 matched product by name: "${liName}"`);
            }

            if (!liProduct) {
              this.logger.warn(`[WEBHOOK] Line item ${liIndex + 1}: No product mapping found for SKU "${liSku}" or name "${liName}". Skipping.`);
              continue;
            }

            // Determine fulfillment amount for this line item
            const liInventorySource = liCpMapping?.inventorySource || 'AUTO';
            let liFulfillmentAmount = 0;
            let liFulfillmentDenominationId: string | null = liExactDenominationId;

            if (liCpMapping?.dcvDenominationId) {
              const mappedDenom = await this.prisma.denomination.findUnique({ where: { id: liCpMapping.dcvDenominationId } });
              if (mappedDenom) {
                liFulfillmentAmount = Number(mappedDenom.faceValue) * liQuantity;
                liFulfillmentDenominationId = mappedDenom.id;
              }
            } else if (liProduct) {
              const liDenoms = await this.prisma.denomination.findMany({ where: { productId: liProduct.id }, orderBy: { faceValue: 'asc' } });
              if (liDenoms.length === 1) {
                liFulfillmentAmount = Number(liDenoms[0].faceValue) * liQuantity;
                liFulfillmentDenominationId = liDenoms[0].id;
              } else if (liDenoms.length > 1 && liExactDenominationId) {
                const exactDenom = liDenoms.find((d: any) => d.id === liExactDenominationId);
                if (exactDenom) {
                  liFulfillmentAmount = Number(exactDenom.faceValue) * liQuantity;
                  liFulfillmentDenominationId = exactDenom.id;
                }
              } else if (liDenoms.length > 1) {
                liFulfillmentAmount = Number(liDenoms[0].faceValue) * liQuantity;
                liFulfillmentDenominationId = liDenoms[0].id;
                this.logger.warn(`[WEBHOOK] Line item ${liIndex + 1}: multiple denominations, using smallest: $${Number(liDenoms[0].faceValue)} × ${liQuantity}`);
              }
            }

            if (liFulfillmentAmount <= 0) {
              this.logger.warn(`[WEBHOOK] Line item ${liIndex + 1}: Could not determine fulfillment amount for "${liProduct.name}". Skipping.`);
              continue;
            }

            this.logger.log(`[WEBHOOK] Line item ${liIndex + 1}: Creating fulfillment for "${liProduct.name}" — $${liFulfillmentAmount} USD`);

            let liFulfillmentResult: any;
            const MAX_WEBHOOK_RETRIES = 3;
            for (let attempt = 1; attempt <= MAX_WEBHOOK_RETRIES; attempt++) {
              try {
                liFulfillmentResult = await this.fulfillmentService.createFulfillment({
                  merchantId,
                  productId: liProduct.id,
                  amount: liFulfillmentAmount,
                  currency: 'USD',
                  referenceId: webhook.orderId || undefined,
                  idempotencyKey: `webhook-${webhook.eventId}-item-${liIndex}`,
                  customerEmail: webhook.customerEmail || undefined,
                  customerName: webhook.customerName || undefined,
                  actorType: 'SYSTEM',
                  actorId: 'webhook-processor',
                  inventorySource: liInventorySource,
                  denominationId: liFulfillmentDenominationId || undefined,
                  variantId: liCpMapping?.dcvVariantId || liVariantId || undefined,
                });
                break;
              } catch (err: any) {
                const isRetryable = err?.response?.code === 'STOCK_CONFLICT' ||
                  err?.response?.code === 'INSUFFICIENT_STOCK' ||
                  err?.message?.includes('Transaction already closed');
                if (isRetryable && attempt < MAX_WEBHOOK_RETRIES) {
                  this.logger.warn(`[WEBHOOK] Line item ${liIndex + 1}: Fulfillment conflict on attempt ${attempt}, retrying...`);
                  await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                  continue;
                }
                throw err;
              }
            }

            this.logger.log(`[WEBHOOK] Line item ${liIndex + 1}: Fulfillment created: ${liFulfillmentResult.fulfillment_id}`);

            this.queueWebhookEvent(merchantId, 'order.fulfilled', {
              orderId: webhook.orderId,
              fulfillmentId: liFulfillmentResult.fulfillment_id,
              productId: liProduct.id,
              productName: liProduct.name,
              customerEmail: webhook.customerEmail,
            });
            } catch (itemError) {
              this.logger.error(
                `[WEBHOOK] Line item ${liIndex + 1} failed: ${(itemError as Error).message} — continuing with remaining items.`,
              );
            }
          }
        }
      } catch (multiError) {
        this.logger.error(`[WEBHOOK] Multi-line-item processing error: ${(multiError as Error).message}`);
      }

    } catch (error) {
      this.logger.error(`[WEBHOOK] Error processing webhook ${webhookId}: ${(error as Error).message}`);
      this.logger.error(`[WEBHOOK] Error stack: ${(error as Error).stack}`);
      await this.prisma.incomingWebhook.update({
        where: { id: webhookId },
        data: {
          processingStatus: 'FAILED',
          errorMessage: (error as Error).message,
          responseCode: 500,
          retryCount: { increment: 1 },
          processedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async listIncomingWebhooks(merchantId?: string) {
    const where: any = {};
    if (merchantId) {
      where.OR = [
        { merchantId },
        { merchantId: null },
      ];
    }
    return this.prisma.incomingWebhook.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listWebhooksByOrderId(orderId: string) {
    return this.prisma.incomingWebhook.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async retryIncomingWebhook(webhookId: string, merchantId: string) {
    const webhook = await this.prisma.incomingWebhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      throw new BadRequestException('Webhook not found');
    }

    // Reset status to PENDING
    await this.prisma.incomingWebhook.update({
      where: { id: webhookId },
      data: {
        processingStatus: 'PENDING',
        errorMessage: null,
        processedAt: null,
        retryCount: { increment: 1 },
      },
    });

    // Process again
    this.processWebhookAsync(webhookId).catch((err) => {
      this.logger.error(`[WEBHOOK] Retry failed for webhook ${webhookId}: ${err.message}`);
    });

    return { success: true, message: 'Webhook reprocessing started' };
  }

  async listConnectedProducts(merchantId: string) {
    return this.prisma.connectedProduct.findMany({
      where: { merchantId },
      orderBy: { lastSyncedAt: 'desc' },
      include: { dcvProduct: { select: { id: true, name: true, region: true } } },
    });
  }

  async updateConnectedProductMapping(
    connectedProductId: string,
    merchantId: string,
    dcvProductId?: string,
    dcvDenominationId?: string | null,
    inventorySource?: string,
    dcvVariantId?: string | null,
  ) {
    const cp = await this.prisma.connectedProduct.findFirst({
      where: { id: connectedProductId, merchantId },
    });
    if (!cp) {
      throw new BadRequestException({
        error: 'NOT_FOUND',
        code: 'CONNECTED_PRODUCT_NOT_FOUND',
        message: 'Connected product not found or does not belong to this merchant',
      });
    }

    const data: any = {};
    if (dcvProductId !== undefined) data.dcvProductId = dcvProductId || null;
    if (dcvDenominationId !== undefined) data.dcvDenominationId = dcvDenominationId || null;
    if (dcvVariantId !== undefined) data.dcvVariantId = dcvVariantId || null;
    if (inventorySource !== undefined) data.inventorySource = inventorySource;

    return this.prisma.connectedProduct.update({
      where: { id: connectedProductId },
      data,
      include: { dcvProduct: { select: { id: true, name: true, region: true } } },
    });
  }

  async getWebhookStatistics(merchantId: string) {
    const [totalWebhooks, completedWebhooks, failedWebhooks, pendingWebhooks, skippedWebhooks, connectedProducts, lastWebhook, emailsSent, emailsFailed] = await Promise.all([
      this.prisma.incomingWebhook.count(),
      this.prisma.incomingWebhook.count({ where: { processingStatus: 'COMPLETED' } }),
      this.prisma.incomingWebhook.count({ where: { processingStatus: 'FAILED' } }),
      this.prisma.incomingWebhook.count({ where: { processingStatus: 'PENDING' } }),
      this.prisma.incomingWebhook.count({ where: { processingStatus: 'SKIPPED' } }),
      this.prisma.connectedProduct.count({ where: { merchantId } }),
      this.prisma.incomingWebhook.findFirst({ orderBy: { createdAt: 'desc' } }),
      this.prisma.emailLog.count({ where: { status: 'SENT' } }),
      this.prisma.emailLog.count({ where: { status: 'FAILED' } }),
    ]);

    // Get platform breakdown
    const webhooksByPlatform = await this.prisma.incomingWebhook.groupBy({
      by: ['platform'],
      _count: { platform: true },
    });

    return {
      totalWebhooks,
      completedWebhooks,
      failedWebhooks,
      pendingWebhooks,
      skippedWebhooks,
      connectedProducts,
      lastWebhookTime: lastWebhook?.createdAt || null,
      emailsSent,
      emailsFailed,
      platforms: webhooksByPlatform.map(p => ({
        platform: p.platform,
        count: p._count.platform,
      })),
    };
  }

  async onModuleDestroy() {
    if (this.processingInterval) clearInterval(this.processingInterval);
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }
}
