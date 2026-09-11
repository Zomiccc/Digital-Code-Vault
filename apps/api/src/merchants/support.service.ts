import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Simple threaded support chat between a merchant and the admin team.
 * Merchants send text + optional payment screenshots; admins reply from the
 * admin panel inbox. Polling-based (no websockets) — clients refetch.
 */
@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  /**
   * Attach the order each message is about.
   *
   * A merchant complaining about an order used to have to type its reference
   * into the text, and the admin then had to go and find it. The message
   * carries the order id, so both sides see what it refers to.
   */
  private async withOrders(messages: any[]) {
    const ids = [...new Set(messages.map((m) => m.fulfillmentId).filter(Boolean))] as string[];
    if (!ids.length) return messages;

    const orders = await this.prisma.fulfillmentRequest.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, referenceId: true, amount: true, currency: true,
        status: true, createdAt: true,
        product: { select: { name: true } },
      },
    });
    const byId = new Map(orders.map((order) => [order.id, order]));

    return messages.map((message) => {
      const order = message.fulfillmentId ? byId.get(message.fulfillmentId) : undefined;
      return {
        ...message,
        order: order
          ? {
              id: order.id,
              reference: order.referenceId || order.id.slice(0, 8),
              product: order.product?.name ?? null,
              amount: Number(order.amount),
              currency: order.currency,
              status: order.status,
              created_at: order.createdAt,
            }
          : null,
      };
    });
  }

  async getMerchantThread(merchantId: string) {
    const messages = await this.prisma.supportMessage.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    // Mark everything as seen by the merchant
    await this.prisma.supportMessage.updateMany({
      where: { merchantId, senderRole: 'ADMIN', readByMerchant: false },
      data: { readByMerchant: true },
    });

    return this.withOrders(messages);
  }

  async sendMerchantMessage(
    merchantId: string,
    senderName: string,
    body?: string,
    image?: string,
    fundingRequestId?: string,
    fulfillmentId?: string,
  ) {
    if (!body && !image) throw new BadRequestException('Message text or an image is required');

    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');

    // An order can only be asked about by the merchant it belongs to.
    if (fulfillmentId) {
      const order = await this.prisma.fulfillmentRequest.findFirst({
        where: { id: fulfillmentId, merchantId },
        select: { id: true },
      });
      if (!order) throw new NotFoundException('Order not found');
    }

    return this.prisma.supportMessage.create({
      data: {
        merchantId,
        senderRole: 'MERCHANT',
        senderName,
        body,
        image,
        fundingRequestId,
        fulfillmentId: fulfillmentId || null,
      },
    });
  }

  /** One row per merchant thread with unread count + last activity. */
  async adminListThreads() {
    const merchants = await this.prisma.merchant.findMany({
      where: {
        OR: [
          { supportMessages: { some: {} } },
        ],
      },
      select: { id: true, name: true, email: true, status: true },
    });

    const threads = await Promise.all(
      merchants.map(async (m) => {
        const [last, unread] = await Promise.all([
          this.prisma.supportMessage.findFirst({
            where: { merchantId: m.id },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.supportMessage.count({
            where: { merchantId: m.id, senderRole: 'MERCHANT', readByAdmin: false },
          }),
        ]);
        return {
          merchantId: m.id,
          merchantName: m.name,
          merchantEmail: m.email,
          merchantStatus: m.status,
          lastMessage: last
            ? { body: last.body?.slice(0, 120) || null, hasImage: !!last.image, senderRole: last.senderRole, createdAt: last.createdAt }
            : null,
          unreadCount: unread,
        };
      }),
    );

    threads.sort((a, b) => {
      const ta = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const tb = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return tb - ta;
    });
    return threads;
  }

  async adminGetThread(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, name: true, email: true, walletBalance: true, currency: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const messages = await this.prisma.supportMessage.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    await this.prisma.supportMessage.updateMany({
      where: { merchantId, senderRole: 'MERCHANT', readByAdmin: false },
      data: { readByAdmin: true },
    });

    return { merchant, messages: await this.withOrders(messages) };
  }

  async adminSendMessage(merchantId: string, senderName: string, body?: string) {
    if (!body) throw new BadRequestException('Message text is required');
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');

    return this.prisma.supportMessage.create({
      data: { merchantId, senderRole: 'ADMIN', senderName, body },
    });
  }
}
