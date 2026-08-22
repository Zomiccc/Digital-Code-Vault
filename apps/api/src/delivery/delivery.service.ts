import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { WebhookService } from '../webhooks/webhook.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private auditService: AuditService,
    private webhookService: WebhookService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  /**
   * Gets delivery info by token (for the customer portal).
   * Does NOT reveal the code — just shows order info.
   * The link is permanent and never expires.
   */
  private async findDeliveryToken(token: string, includeMerchant = false) {
    const tokenHash = this.encryptionService.hashToken(token);

    const include = {
      fulfillment: {
        include: {
          product: true,
          allocations: true,
          ...(includeMerchant ? { merchant: true } : {}),
        },
      },
    };

    // First, try looking up by hashed token (normal flow — raw token from email link)
    let deliveryToken = await this.prisma.deliveryToken.findUnique({
      where: { tokenHash },
      include,
    });

    // Fallback: the token might already be the tokenHash (e.g., from customer dashboard)
    if (!deliveryToken) {
      deliveryToken = await this.prisma.deliveryToken.findUnique({
        where: { tokenHash: token },
        include,
      });
    }

    return deliveryToken;
  }

  async getDeliveryInfo(token: string) {
    const deliveryToken = await this.findDeliveryToken(token);

    if (!deliveryToken) {
      throw new NotFoundException({
        error: 'NOT_FOUND',
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired delivery link',
      });
    }

    // No expiry check — the link is permanent

    const isRevealed = !!deliveryToken.revealedAt;

    // Send delivery ready email asynchronously (does not block the page response)
    // Triggered only by the customer delivery flow — never by webhooks.
    if (deliveryToken.fulfillment.customerEmail) {
      const customerEmail = deliveryToken.fulfillment.customerEmail;
      const customerName = deliveryToken.fulfillment.customerName || customerEmail;
      const orderId = deliveryToken.fulfillment.referenceId || deliveryToken.fulfillmentId;
      const productName = deliveryToken.fulfillment.product.name;
      const amount = deliveryToken.fulfillment.amount
        ? `${deliveryToken.fulfillment.currency || 'USD'} ${deliveryToken.fulfillment.amount}`
        : 'N/A';
      const baseUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
      const deliveryLink = `${baseUrl}/api/v1/reveal/${token}`;

      this.emailService.sendDeliveryReadyEmail(
        customerEmail,
        customerName,
        orderId,
        productName,
        amount,
        deliveryLink,
      ).then((success) => {
        if (success) {
          this.logger.log(
            `[DELIVERY EMAIL] Sent successfully — customer: ${customerEmail}, order: ${orderId}, token: ${deliveryToken.id.slice(0, 8)}..., time: ${new Date().toISOString()}`
          );
        } else {
          this.logger.warn(
            `[DELIVERY EMAIL] Send returned false — customer: ${customerEmail}, order: ${orderId}, token: ${deliveryToken.id.slice(0, 8)}...`
          );
        }
      }).catch((err) => {
        this.logger.error(
          `[DELIVERY EMAIL] Failed to send — customer: ${customerEmail}, order: ${orderId}, error: ${(err as Error).message}`
        );
      });
    }

    return {
      fulfillment_id: deliveryToken.fulfillmentId,
      product_name: deliveryToken.fulfillment.product.name,
      reference_id: deliveryToken.fulfillment.referenceId,
      customer_email: deliveryToken.fulfillment.customerEmail,
      customer_name: deliveryToken.fulfillment.customerName,
      is_revealed: isRevealed,
      revealed_at: deliveryToken.revealedAt,
      status: deliveryToken.fulfillment.status,
    };
  }

  /**
   * Reveals the code(s) for a delivery token.
   * The link is permanent — codes can be viewed multiple times.
   * Each reveal is logged for audit purposes.
   * The code is marked as DELIVERED on first reveal to prevent reuse.
   */
  async revealCode(token: string, ip?: string) {
    const deliveryToken = await this.findDeliveryToken(token, true);

    if (!deliveryToken) {
      throw new NotFoundException({
        error: 'NOT_FOUND',
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired delivery link',
      });
    }

    // No expiry check — the link is permanent

    // Get the allocation
    const allocation = deliveryToken.fulfillment.allocations[0];
    if (!allocation) {
      throw new NotFoundException({
        error: 'NO_ALLOCATION',
        code: 'NO_ALLOCATION',
        message: 'No codes allocated to this fulfillment',
      });
    }

    const ids: string[] = JSON.parse(allocation.codeItemIds || '[]');

    if (ids.length === 0) {
      throw new NotFoundException({
        error: 'NO_ALLOCATION',
        code: 'EMPTY_ALLOCATION',
        message: 'No codes allocated to this fulfillment',
      });
    }

    // Get the code items (with denomination in one query — avoids N+1 and any
    // window where a denomination lookup could silently fail per-item)
    const codeItems = await this.prisma.codeItem.findMany({
      where: { id: { in: ids } },
      include: { denomination: true },
    });

    // ROOT CAUSE FIX: previously, a decrypt failure for any single code was silently
    // swallowed (logged and skipped), so a 1-code allocation could resolve to an EMPTY
    // codes array while still being marked DELIVERED — the customer would see nothing.
    // Now: every allocated code MUST decrypt to a non-empty plaintext value BEFORE we
    // proceed. If any code fails, we fail loudly and do NOT mark anything as delivered,
    // so the customer can safely retry and support can be alerted.
    if (codeItems.length !== ids.length) {
      this.logger.error(
        `[DELIVERY] Allocation ${allocation.id} references ${ids.length} code item(s) but only ${codeItems.length} were found in the database. fulfillmentId=${deliveryToken.fulfillmentId}`
      );
      throw new NotFoundException({
        error: 'ALLOCATION_CORRUPT',
        code: 'MISSING_CODE_ITEMS',
        message: 'Some allocated codes could not be found. Please contact support.',
      });
    }

    const codes: { denomination: string; code: string }[] = [];
    const decryptFailures: string[] = [];

    for (const item of codeItems) {
      try {
        const plaintext = this.encryptionService.decrypt(item.encryptedCode);
        if (!plaintext || plaintext.trim().length === 0) {
          decryptFailures.push(item.id);
          continue;
        }
        codes.push({
          denomination: `$${item.denomination?.faceValue ?? '??'}`,
          code: plaintext,
        });
      } catch (err) {
        // Never log the plaintext or encrypted payload — identifiers only.
        this.logger.error(`[DELIVERY] Failed to decrypt code item ${item.id} for fulfillment ${deliveryToken.fulfillmentId}: ${(err as Error).message}`);
        decryptFailures.push(item.id);
      }
    }

    if (decryptFailures.length > 0 || codes.length !== ids.length) {
      this.logger.error(
        `[DELIVERY] CRITICAL: ${decryptFailures.length}/${ids.length} code(s) failed to decrypt for fulfillment ${deliveryToken.fulfillmentId}. Refusing to reveal a partial/empty result.`
      );
      throw new NotFoundException({
        error: 'DECRYPTION_FAILED',
        code: 'CODE_DECRYPT_FAILED',
        message: 'Unable to retrieve one or more of your codes right now. Please contact support — your codes have NOT been lost.',
      });
    }

    // Mark as delivered and update reveal tracking (only on first reveal)
    // Subsequent reveals just log the access
    const isFirstReveal = !deliveryToken.revealedAt;

    if (isFirstReveal) {
      await this.prisma.$transaction(async (tx) => {
        // Update code items to DELIVERED
        await tx.codeItem.updateMany({
          where: { id: { in: ids } },
          data: {
            status: 'DELIVERED',
            revealedAt: new Date(),
            revealedIp: ip,
          },
        });

        // Update delivery token with first reveal info
        await tx.deliveryToken.update({
          where: { id: deliveryToken.id },
          data: {
            revealedAt: new Date(),
            revealedIp: ip,
          },
        });

        // Update fulfillment status
        await tx.fulfillmentRequest.update({
          where: { id: deliveryToken.fulfillmentId },
          data: { status: 'DELIVERED' },
        });
      });
    }

    // Audit log — log every reveal access
    await this.auditService.log({
      actorType: 'CUSTOMER',
      action: 'delivery.revealed',
      entity: 'DeliveryToken',
      entityId: deliveryToken.id,
      metadata: {
        fulfillmentId: deliveryToken.fulfillmentId,
        product: deliveryToken.fulfillment.product.name,
        codeCount: codes.length,
        isFirstReveal,
      },
      ip,
    });

    // Fire webhook on first reveal
    if (isFirstReveal) {
      this.webhookService.queueWebhookEvent(
        deliveryToken.fulfillment.merchantId,
        'delivery.revealed',
        {
          fulfillment_id: deliveryToken.fulfillmentId,
          reference_id: deliveryToken.fulfillment.referenceId,
          revealed_at: new Date().toISOString(),
        },
      ).catch(() => {});
    }

    return {
      already_revealed: !isFirstReveal,
      revealed_at: deliveryToken.revealedAt || new Date().toISOString(),
      product_name: deliveryToken.fulfillment.product.name,
      reference_id: deliveryToken.fulfillment.referenceId,
      customer_email: deliveryToken.fulfillment.customerEmail,
      customer_name: deliveryToken.fulfillment.customerName,
      codes,
    };
  }

  /**
   * Regenerates the permanent delivery link for a fulfillment (e.g. APP_URL changed,
   * customer lost the email). The old token is replaced — previous links stop working.
   * Returns the raw token exactly once; only its hash is stored.
   */
  async regenerateDeliveryLink(fulfillmentId: string, actorId?: string) {
    const fulfillment = await this.prisma.fulfillmentRequest.findUnique({
      where: { id: fulfillmentId },
      include: { allocations: true },
    });
    if (!fulfillment) throw new NotFoundException('Fulfillment not found');
    if (!['ALLOCATED', 'DELIVERED'].includes(fulfillment.status)) {
      throw new NotFoundException('Fulfillment has not been allocated yet');
    }

    const rawToken = this.encryptionService.generateToken(32);
    const tokenHash = this.encryptionService.hashToken(rawToken);

    await this.prisma.deliveryToken.upsert({
      where: { fulfillmentId },
      create: { fulfillmentId, tokenHash },
      update: { tokenHash, revealedAt: null, revealedIp: null },
    });

    if (actorId) {
      await this.auditService.log({
        actorType: 'ADMIN',
        actorId,
        action: 'delivery.link.regenerated',
        entity: 'FulfillmentRequest',
        entityId: fulfillmentId,
      }).catch(() => {});
    }

    const baseUrl = (this.configService.get<string>('APP_URL', 'http://localhost:3000') || '').replace(/\/+$/, '');
    return {
      fulfillment_id: fulfillmentId,
      delivery_link: `${baseUrl}/api/v1/reveal/${rawToken}`,
      portal_link: `${baseUrl}/d/${rawToken}`,
    };
  }
}
