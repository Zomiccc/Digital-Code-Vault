import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { EncryptionService } from '../encryption/encryption.service';
import { WalletService } from '../wallet/wallet.service';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';

@Injectable()
export class MerchantsService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private encryptionService: EncryptionService,
    private walletService: WalletService,
    private configService: ConfigService,
  ) {}

  /**
   * Admin payment accounts shown to merchants when adding funds.
   * All values are env-configurable so the admin can change them anytime.
   */
  getAdminPaymentDetails() {
    return {
      accounts: [
        {
          kind: 'RAAST ID',
          accountTitle: this.configService.get<string>('PAY_RAAST_TITLE', 'DICE GAMES'),
          accountNumber: this.configService.get<string>('PAY_RAAST_NUMBER', '03247666222'),
          iban: this.configService.get<string>('PAY_RAAST_IBAN', 'PK03ALFH0303001007274922'),
        },
        {
          kind: 'Meezan Bank',
          accountTitle: this.configService.get<string>('PAY_MEEZAN_TITLE', 'DICE GAMES'),
          accountNumber: this.configService.get<string>('PAY_MEEZAN_NUMBER', '01370104307608'),
          iban: this.configService.get<string>('PAY_MEEZAN_IBAN', 'PK48MEZN0001370104307608'),
        },
        {
          kind: 'Faysal Bank',
          accountTitle: this.configService.get<string>('PAY_FAYSAL_TITLE', 'DICE GAMES'),
          accountNumber: this.configService.get<string>('PAY_FAYSAL_NUMBER', '0441007000002234'),
          iban: this.configService.get<string>('PAY_FAYSAL_IBAN', 'PK27FAYS0441007000002234'),
        },
        {
          kind: 'NayaPay',
          merchantTitle: this.configService.get<string>('PAY_NAYAPAY_TITLE', 'CodesDukaan'),
          note: 'Search for "CodesDukaan" or DICE GAMES in the Merchants section of the NayaPay app.',
        },
      ],
      supportContact: {
        name: this.configService.get<string>('SUPPORT_CONTACT_NAME', 'Support Team'),
        number: this.configService.get<string>('SUPPORT_CONTACT_NUMBER', ''),
      },
      instructions:
        'Send the exact USD amount to any account above, then upload the payment screenshot here. Admin verifies and approves — your wallet updates automatically.',
    };
  }

  async createMerchant(data: {
    name: string;
    email: string;
    password: string;
    address?: string;
    currency?: string;
    initialBalance?: number;
    allowedProductIds?: string[];
  }) {
    const existing = await this.prisma.merchant.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new BadRequestException('Merchant with this email already exists');
    }

    const passwordHash = await argon2.hash(data.password);

    const webhookSecret = this.encryptionService.generateToken(32);

    const merchant = await this.prisma.merchant.create({
      data: {
        name: data.name,
        email: data.email,
        address: data.address || null,
        walletBalance: data.initialBalance || 0,
        currency: data.currency || 'USD',
        allowedProductIds: JSON.stringify(data.allowedProductIds || []),
        webhookSecret,
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
      address: merchant.address,
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
        address: true,
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

  async updateMerchantCurrency(id: string, currency: string) {
    const validCurrencies = ['USD', 'PKR', 'EUR'];
    const upper = currency.toUpperCase();
    if (!validCurrencies.includes(upper)) {
      throw new BadRequestException(`Invalid currency. Must be one of: ${validCurrencies.join(', ')}`);
    }
    const updated = await this.prisma.merchant.update({ where: { id }, data: { currency: upper } });
    return { id: updated.id, currency: updated.currency };
  }

  async getWebhookSecret(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    if (!merchant.webhookSecret) {
      const secret = this.encryptionService.generateToken(32);
      await this.prisma.merchant.update({ where: { id: merchantId }, data: { webhookSecret: secret } });
      return { webhook_secret: secret };
    }
    return { webhook_secret: merchant.webhookSecret };
  }

  async regenerateWebhookSecret(merchantId: string) {
    const secret = this.encryptionService.generateToken(32);
    await this.prisma.merchant.update({ where: { id: merchantId }, data: { webhookSecret: secret } });
    return { webhook_secret: secret };
  }

  async addWalletCredit(merchantId: string, amount: number, adminId: string, ip?: string) {
    const adminWalletId = await this.walletService.getOrCreateAdminWallet();

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Debit admin wallet
      const updatedAdminWallet = await tx.adminWallet.update({
        where: { id: adminWalletId },
        data: { balance: { decrement: amount } },
      });

      if (Number(updatedAdminWallet.balance) < 0) {
        throw new BadRequestException({
          error: 'INSUFFICIENT_ADMIN_WALLET',
          code: 'INSUFFICIENT_ADMIN_WALLET',
          message: `Admin wallet has insufficient balance. Required: ${amount}, Available: ${Number(updatedAdminWallet.balance) + amount}`,
        });
      }

      // 2. Create admin wallet transaction
      await tx.adminWalletTransaction.create({
        data: {
          adminWalletId,
          type: 'DEBIT',
          amount,
          balanceAfter: updatedAdminWallet.balance,
          source: 'MANUAL',
          description: `Manual credit to merchant ${merchantId} by admin ${adminId}`,
        },
      });

      // 3. Credit merchant wallet
      const updatedMerchant = await tx.merchant.update({
        where: { id: merchantId },
        data: { walletBalance: { increment: amount } },
      });

      // 4. Create merchant wallet transaction
      await tx.walletTransaction.create({
        data: {
          merchantId,
          type: 'CREDIT',
          amount,
          balanceAfter: updatedMerchant.walletBalance,
        },
      });

      return { new_balance: updatedMerchant.walletBalance };
    });

    return { success: true, ...result };
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
      name: merchant.name,
      email: merchant.email,
      address: merchant.address,
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
    const keys = await this.prisma.apiKey.findMany({
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

    // Calculate rate limiting info
    const activeKeys = keys.filter((k) => k.status === 'ACTIVE');
    const maxActiveKeys = 3;
    const cooldownHours = 24;

    let nextAvailableKey: Date | null = null;
    let remainingKeys = maxActiveKeys - activeKeys.length;

    if (remainingKeys <= 0 && activeKeys.length > 0) {
      // Find the most recently created active key
      const lastKey = activeKeys.reduce((latest, k) =>
        new Date(k.createdAt) > new Date(latest.createdAt) ? k : latest
      );
      const lastKeyTime = new Date(lastKey.createdAt);
      const cooldownEnd = new Date(lastKeyTime.getTime() + cooldownHours * 60 * 60 * 1000);

      if (cooldownEnd > new Date()) {
        nextAvailableKey = cooldownEnd;
        remainingKeys = 0;
      } else {
        // Cooldown has passed, can generate one more key
        remainingKeys = 1;
      }
    }

    return {
      keys,
      rate_limit: {
        max_active_keys: maxActiveKeys,
        active_keys: activeKeys.length,
        remaining_keys: remainingKeys,
        next_available_key: nextAvailableKey,
        cooldown_hours: cooldownHours,
      },
    };
  }

  async createApiKey(merchantId: string, scopes?: string[]) {
    // ─── Check rate limiting: max 3 active keys, 24-hour rolling cooldown ───
    const activeKeys = await this.prisma.apiKey.findMany({
      where: { merchantId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    const maxActiveKeys = 3;
    const cooldownHours = 24;

    if (activeKeys.length >= maxActiveKeys) {
      // Check if 24 hours have passed since the last key was created
      const lastKey = activeKeys[0]; // Already sorted by createdAt desc
      const lastKeyTime = new Date(lastKey.createdAt);
      const cooldownEnd = new Date(lastKeyTime.getTime() + cooldownHours * 60 * 60 * 1000);

      if (cooldownEnd > new Date()) {
        const remainingMs = cooldownEnd.getTime() - Date.now();
        const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
        const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        const remainingSeconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

        throw new BadRequestException({
          error: 'RATE_LIMIT_EXCEEDED',
          code: 'API_KEY_LIMIT_REACHED',
          message: `You have reached today's API key limit. You can generate another API key after 24 hours.`,
          details: {
            active_keys: activeKeys.length,
            max_active_keys: maxActiveKeys,
            next_available_key: cooldownEnd.toISOString(),
            time_remaining: `${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s`,
          },
        });
      }
    }

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
        currency: r.currency,
        status: r.status,
        failure_reason: (r as any).failureReason,
        reference_id: r.referenceId,
        created_at: r.createdAt,
        customer_name: r.customerName,
        customer_email: r.customerEmail,
        customer_address: r.customerAddress,
        revealed: r.deliveryToken?.revealedAt ? true : false,
      })),
      total,
    };
  }
}
