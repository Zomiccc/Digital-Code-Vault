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

    // Get the code items
    const codeItems = await this.prisma.codeItem.findMany({
      where: { id: { in: ids } },
    });

    // Decrypt each code
    const codes: { denomination: string; code: string }[] = [];
    for (const item of codeItems) {
      try {
        const plaintext = this.encryptionService.decrypt(item.encryptedCode);
        const denomination = await this.prisma.denomination.findUnique({
          where: { id: item.denominationId },
        });
        codes.push({
          denomination: `$${denomination?.faceValue || '??'}`,
          code: plaintext,
        });
      } catch (err) {
        this.logger.error(`Failed to decrypt code ${item.id}: ${(err as Error).message}`);
      }
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
}
