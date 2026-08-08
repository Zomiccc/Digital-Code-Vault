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

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private configService: ConfigService,
    @Inject(forwardRef(() => FulfillmentService)) private fulfillmentService: FulfillmentService,
  ) {
    this.maxRetries = this.configService.get<number>('WEBHOOK_MAX_RETRIES', 8);
    this.redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
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
        { connection, concurrency: 5 },
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

    // ─── Verify endpoint is reachable and responds to challenge (optional) ───
    const secret = this.encryptionService.generateToken(32);

    if (!skipVerification) {
      await this.verifyWebhookChallenge(url, merchantId);
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
    this.logger.log(`[WEBHOOK] Headers: ${JSON.stringify(headers)}`);
    this.logger.log(`[WEBHOOK] Payload: ${JSON.stringify(payload)}`);

    // Detect provider and normalize payload
    const detected = ProviderDetector.detect(headers, payload);
    const normalized = ProviderDetector.normalize(headers, payload);
    this.logger.log(`[WEBHOOK] Detected provider: ${detected.provider} (confidence: ${detected.confidence})`);
    this.logger.log(`[WEBHOOK] Normalized payload: ${JSON.stringify(normalized)}`);

    // Extract or generate event ID for duplicate detection
    const eventId = normalized.eventId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

    // Store the webhook with full metadata
    const webhook = await this.prisma.incomingWebhook.create({
      data: {
        eventId,
        merchantId: null,
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

    // Process the webhook asynchronously
    this.processWebhookAsync(webhook.id).catch((err) => {
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

  private async syncConnectedProduct(webhook: any, merchantId: string): Promise<string | null> {
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

      // Check if connected product already exists
      const whereClause: any = {
        merchantId,
        platform: webhook.platform,
      };
      if (platformProductId) {
        whereClause.OR = [{ platformProductId }, ...(platformSku ? [{ platformSku }] : [])];
      } else if (platformSku) {
        whereClause.platformSku = platformSku;
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
        return existing.id;
      } else {
        // Create new
        const created = await this.prisma.connectedProduct.create({
          data: {
            merchantId,
            platform: webhook.platform,
            provider: webhook.provider || null,
            platformProductId,
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
        return created.id;
      }
    } catch (error) {
      this.logger.error(`[WEBHOOK] Error syncing ConnectedProduct: ${(error as Error).message}`);
      return null;
    }
  }

  private async processWebhookAsync(webhookId: string) {
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

      // Find merchant: try merchantId on webhook, then find by product, then first active
      let merchantId = webhook.merchantId;

      if (!merchantId) {
        // Try to find merchant from product mapping
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
          // Find first active merchant as default
          const defaultMerchant = await this.prisma.merchant.findFirst({
            where: { status: 'ACTIVE' },
          });
          if (!defaultMerchant) {
            throw new Error('No active merchant found for fulfillment');
          }
          merchantId = defaultMerchant.id;
          this.logger.log(`[WEBHOOK] Using default merchant: ${merchantId}`);
        }
      }

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
      const connectedProductId = await this.syncConnectedProduct(syncData, merchantId);

      // Find local product by name or ID using multi-strategy matching
      this.logger.log(`[WEBHOOK] Looking for product: ${webhook.productName || webhook.productId}`);
      let product = null;
      const searchName = webhook.productName || '';
      const searchId = webhook.productId || '';

      // Strategy 1: Exact ID match
      if (searchId) {
        product = await this.prisma.product.findUnique({ where: { id: searchId } });
      }

      // Strategy 2-4: Load all products once and match using multiple strategies
      if (!product && searchName) {
        const allProducts = await this.prisma.product.findMany();
        const searchLower = searchName.toLowerCase();

        // Strategy 2: Exact name match (case-insensitive)
        product = allProducts.find((p) => p.name.toLowerCase() === searchLower) || null;

        // Strategy 3: DB product name contains webhook name or vice versa
        if (!product) {
          product = allProducts.find((p) => p.name.toLowerCase().includes(searchLower)) || null;
        }

        // Strategy 4: Keyword-based matching (handles "PlayStation USA Digital Code" → "PSN")
        if (!product) {
          const aliases: Record<string, string[]> = {
            'psn': ['playstation', 'psn', 'ps'],
            'xbox': ['xbox', 'microsoft'],
            'steam': ['steam', 'valve'],
            'roblox': ['roblox'],
            'google': ['google', 'android'],
            'amazon': ['amazon', 'aws'],
            'apple': ['apple', 'ios', 'itunes', 'appstore'],
            'netflix': ['netflix'],
            'spotify': ['spotify'],
          };

          for (const p of allProducts) {
            const dbName = p.name.toLowerCase();
            const productAliases = aliases[dbName] || [dbName];
            for (const alias of productAliases) {
              if (searchLower.includes(alias)) {
                product = p;
                this.logger.log(`[WEBHOOK] Matched product "${p.name}" via keyword alias "${alias}"`);
                break;
              }
            }
            if (product) break;

            const dbWords = dbName.split(/\s+/).filter((w) => w.length >= 3);
            if (dbWords.length > 0 && dbWords.every((w) => searchLower.includes(w))) {
              product = p;
              this.logger.log(`[WEBHOOK] Matched product "${p.name}" via word match`);
              break;
            }
          }
        }
      }

      if (!product) {
        const errMsg = `Product not found: ${searchName || searchId}. ConnectedProduct synced.`;
        this.logger.warn(`[WEBHOOK] ${errMsg}`);
        throw new Error(errMsg);
      }

      this.logger.log(`[WEBHOOK] Product found: ${product.id} - ${product.name}`);

      // Use FulfillmentService for proper order processing
      const webhookAmount = webhook.amount ? Number(webhook.amount) : 0;
      this.logger.log(`[WEBHOOK] Creating fulfillment via FulfillmentService for merchant ${merchantId}`);

      const fulfillmentResult = await this.fulfillmentService.createFulfillment({
        merchantId,
        productId: product.id,
        amount: webhookAmount,
        currency: webhook.currency || 'USD',
        referenceId: webhook.orderId || undefined,
        idempotencyKey: `webhook-${webhook.eventId}`,
        customerEmail: webhook.customerEmail || undefined,
        customerName: webhook.customerName || undefined,
        actorType: 'SYSTEM',
        actorId: 'webhook-processor',
      });

      this.logger.log(`[WEBHOOK] Fulfillment created: ${fulfillmentResult.fulfillment_id}`);

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

      this.logger.log(`[WEBHOOK] Successfully processed webhook ${webhookId}`);

      // Trigger outgoing webhook notification
      this.queueWebhookEvent(merchantId, 'order.fulfilled', {
        orderId: webhook.orderId,
        fulfillmentId: fulfillmentResult.fulfillment_id,
        productId: product.id,
        productName: product.name,
        customerEmail: webhook.customerEmail,
      });

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
