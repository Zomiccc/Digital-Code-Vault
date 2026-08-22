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

    return messages;
  }

  async sendMerchantMessage(
    merchantId: string,
    senderName: string,
    body?: string,
    image?: string,
    fundingRequestId?: string,
  ) {
    if (!body && !image) throw new BadRequestException('Message text or an image is required');

    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');

    return this.prisma.supportMessage.create({
      data: {
        merchantId,
        senderRole: 'MERCHANT',
        senderName,
        body,
        image,
        fundingRequestId,
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

    return { merchant, messages };
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
