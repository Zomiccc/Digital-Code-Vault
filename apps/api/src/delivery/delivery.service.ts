import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { WebhookService } from '../webhooks/webhook.service';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private auditService: AuditService,
    private webhookService: WebhookService,
    private configService: ConfigService,
  ) {}

  /**
   * Gets delivery info by token (for the customer portal).
   * Does NOT reveal the code — just shows order info and whether it's been revealed.
   */
  async getDeliveryInfo(token: string) {
    const tokenHash = this.encryptionService.hashToken(token);

    const deliveryToken = await this.prisma.deliveryToken.findUnique({
      where: { tokenHash },
      include: {
        fulfillment: {
          include: {
            product: true,
            allocations: true,
          },
        },
      },
    });

    if (!deliveryToken) {
      throw new NotFoundException({
        error: 'NOT_FOUND',
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired delivery link',
      });
    }

    if (deliveryToken.expiresAt < new Date()) {
      throw new BadRequestException({
        error: 'EXPIRED',
        code: 'TOKEN_EXPIRED',
        message: 'This delivery link has expired',
      });
    }

    const isRevealed = !!deliveryToken.revealedAt;

    return {
      fulfillment_id: deliveryToken.fulfillmentId,
      product_name: deliveryToken.fulfillment.product.name,
      reference_id: deliveryToken.fulfillment.referenceId,
      is_revealed: isRevealed,
      revealed_at: deliveryToken.revealedAt,
      expires_at: deliveryToken.expiresAt,
      status: deliveryToken.fulfillment.status,
    };
  }

  /**
   * Reveals the code(s) for a delivery token.
   * This is the ONE-TIME reveal: marks codes as DELIVERED, logs the reveal.
   * If already revealed, returns the "already revealed" state without the code.
   */
  async revealCode(token: string, ip?: string) {
    const tokenHash = this.encryptionService.hashToken(token);

    const deliveryToken = await this.prisma.deliveryToken.findUnique({
      where: { tokenHash },
      include: {
        fulfillment: {
          include: {
            product: true,
            allocations: true,
            merchant: true,
          },
        },
      },
    });

    if (!deliveryToken) {
      throw new NotFoundException({
        error: 'NOT_FOUND',
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired delivery link',
      });
    }

    if (deliveryToken.expiresAt < new Date()) {
      throw new BadRequestException({
        error: 'EXPIRED',
        code: 'TOKEN_EXPIRED',
        message: 'This delivery link has expired',
      });
    }

    // Already revealed — return the "already revealed" state, NOT the code
    if (deliveryToken.revealedAt) {
      return {
        already_revealed: true,
        revealed_at: deliveryToken.revealedAt,
        product_name: deliveryToken.fulfillment.product.name,
        reference_id: deliveryToken.fulfillment.referenceId,
        codes: [],
      };
    }

    // First reveal — decrypt and return codes
    const allocation = deliveryToken.fulfillment.allocations[0];
    if (!allocation) {
      throw new BadRequestException({
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

    // Mark as delivered in a transaction
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

      // Update delivery token
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

    // Audit log
    await this.auditService.log({
      actorType: 'CUSTOMER',
      action: 'delivery.revealed',
      entity: 'DeliveryToken',
      entityId: deliveryToken.id,
      metadata: {
        fulfillmentId: deliveryToken.fulfillmentId,
        product: deliveryToken.fulfillment.product.name,
        codeCount: codes.length,
      },
      ip,
    });

    // Fire webhook
    this.webhookService.queueWebhookEvent(
      deliveryToken.fulfillment.merchantId,
      'delivery.revealed',
      {
        fulfillment_id: deliveryToken.fulfillmentId,
        reference_id: deliveryToken.fulfillment.referenceId,
        revealed_at: new Date().toISOString(),
      },
    ).catch(() => {});

    return {
      already_revealed: false,
      revealed_at: new Date().toISOString(),
      product_name: deliveryToken.fulfillment.product.name,
      reference_id: deliveryToken.fulfillment.referenceId,
      codes,
    };
  }
}
