import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import * as crypto from 'crypto';

interface WebhookJob {
  endpointId: string;
  url: string;
  secret: string;
  payload: any;
  attempts: number;
  maxAttempts: number;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly queue: WebhookJob[] = [];
  private readonly processing = new Set<string>();
  private processingInterval?: ReturnType<typeof setInterval>;

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private configService: ConfigService,
  ) {
    // Process queue every 5 seconds
    this.processingInterval = setInterval(() => this.processQueue(), 5000);
  }

  private async processQueue() {
    if (this.queue.length === 0) return;

    const job = this.queue.shift();
    if (!job) return;

    if (job.attempts >= job.maxAttempts) {
      this.logger.error(`Webhook permanently failed after ${job.attempts} attempts: ${job.url}`);
      return;
    }

    const body = JSON.stringify(job.payload);
    const signature = crypto
      .createHmac('sha256', job.secret)
      .update(body)
      .digest('hex');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(job.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': job.payload.event,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status >= 200 && response.status < 300) {
        this.logger.log(`Webhook delivered to ${job.url} (status ${response.status})`);
      } else {
        this.logger.warn(`Webhook to ${job.url} returned status ${response.status}`);
        job.attempts++;
        const delay = Math.min(5000 * Math.pow(2, job.attempts - 1), 300000);
        setTimeout(() => this.queue.push(job), delay);
      }
    } catch (err) {
      this.logger.warn(`Webhook delivery failed: ${(err as Error).message}`);
      job.attempts++;
      const delay = Math.min(5000 * Math.pow(2, job.attempts - 1), 300000);
      setTimeout(() => this.queue.push(job), delay);
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

    if (endpoints.length === 0) return;

    const payload = {
      event,
      ...data,
      timestamp: Date.now(),
    };

    for (const endpoint of endpoints) {
      this.queue.push({
        endpointId: endpoint.id,
        url: endpoint.url,
        secret: endpoint.secret,
        payload,
        attempts: 0,
        maxAttempts: this.configService.get<number>('WEBHOOK_MAX_RETRIES', 8),
      });
    }
  }

  async registerEndpoint(merchantId: string, url: string) {
    // Validate URL is HTTPS
    if (!url.startsWith('https://')) {
      throw new Error('Webhook URL must be HTTPS');
    }

    const secret = this.encryptionService.generateToken(32);

    // Send verification challenge
    const challenge = this.encryptionService.generateToken(16);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'webhook.verification',
          challenge,
          timestamp: Date.now(),
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (response.status >= 200 && response.status < 300) {
        // Check if the response contains the challenge echoed back
        const text = await response.text();
        if (!text.includes(challenge)) {
          throw new Error('Webhook endpoint did not echo back verification challenge');
        }
      } else {
        throw new Error(`Webhook verification failed with status ${response.status}`);
      }
    } catch (err) {
      throw new Error(`Webhook verification failed: ${(err as Error).message}`);
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
      secret, // Only shown once
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
}
