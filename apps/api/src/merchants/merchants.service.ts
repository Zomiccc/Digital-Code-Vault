import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';

@Injectable()
export class MerchantsService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async createMerchant(data: {
    name: string;
    email: string;
    password: string;
    currency?: string;
    initialBalance?: number;
    allowedProductIds?: string[];
  }) {
    const existing = await this.prisma.merchant.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new BadRequestException('Merchant with this email already exists');
    }

    const passwordHash = await argon2.hash(data.password);

    const merchant = await this.prisma.merchant.create({
      data: {
        name: data.name,
        email: data.email,
        walletBalance: data.initialBalance || 0,
        currency: data.currency || 'USD',
        allowedProductIds: JSON.stringify(data.allowedProductIds || []),
        users: {
          create: {
            email: data.email,
            name: data.name,
            passwordHash,
          },
        },
      },
      include: { users: true },
    });

    return {
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      wallet_balance: merchant.walletBalance,
      currency: merchant.currency,
      status: merchant.status,
      created_at: merchant.createdAt,
    };
  }

  async listMerchants() {
    return this.prisma.merchant.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        walletBalance: true,
        currency: true,
        allowedProductIds: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMerchant(id: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return merchant;
  }

  async updateMerchantStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED') {
    await this.prisma.merchant.update({ where: { id }, data: { status } });
    return { success: true };
  }

  async addWalletCredit(merchantId: string, amount: number, adminId: string, ip?: string) {
    const merchant = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { walletBalance: { increment: amount } },
    });

    await this.prisma.walletTransaction.create({
      data: {
        merchantId,
        type: 'CREDIT',
        amount,
        balanceAfter: merchant.walletBalance,
      },
    });

    return { success: true, new_balance: merchant.walletBalance };
  }

  async getWallet(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const recentTxns = await this.prisma.walletTransaction.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      balance: merchant.walletBalance,
      currency: merchant.currency,
      recent_transactions: recentTxns.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        reference_id: t.referenceId,
        created_at: t.createdAt,
      })),
    };
  }

  async listApiKeys(merchantId: string) {
    return this.prisma.apiKey.findMany({
      where: { merchantId },
      select: {
        id: true,
        keyPrefix: true,
        scopes: true,
        status: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApiKey(merchantId: string, scopes?: string[]) {
    return this.authService.createApiKey(merchantId, scopes || ['fulfillment', 'read']);
  }

  async revokeApiKey(merchantId: string, keyId: string) {
    return this.authService.revokeApiKey(merchantId, keyId);
  }

  async listFulfillmentRequests(merchantId: string, limit = 50, offset = 0) {
    const [reqs, total] = await Promise.all([
      this.prisma.fulfillmentRequest.findMany({
        where: { merchantId },
        include: {
          product: true,
          allocations: true,
          deliveryToken: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.fulfillmentRequest.count({ where: { merchantId } }),
    ]);

    return {
      items: reqs.map((r) => ({
        id: r.id,
        product: r.product.name,
        amount: r.amount,
        status: r.status,
        reference_id: r.referenceId,
        created_at: r.createdAt,
        revealed: r.deliveryToken?.revealedAt ? true : false,
      })),
      total,
    };
  }
}
