import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ─── Admin Wallet ───

  async getOrCreateAdminWallet(): Promise<string> {
    let wallet = await this.prisma.adminWallet.findFirst();
    if (!wallet) {
      wallet = await this.prisma.adminWallet.create({
        data: { balance: 0, currency: 'USD' },
      });
      this.logger.log(`Admin wallet created: ${wallet.id}`);
    }
    return wallet.id;
  }

  async getAdminWallet() {
    const walletId = await this.getOrCreateAdminWallet();
    const wallet = await this.prisma.adminWallet.findUnique({
      where: { id: walletId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        fundingRequests: {
          include: { merchant: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!wallet) {
      throw new NotFoundException('Admin wallet not found');
    }

    // Aggregate stats
    const totalCredits = await this.prisma.adminWalletTransaction.aggregate({
      where: { adminWalletId: walletId, type: 'CREDIT' },
      _sum: { amount: true },
    });
    const totalDebits = await this.prisma.adminWalletTransaction.aggregate({
      where: { adminWalletId: walletId, type: 'DEBIT' },
      _sum: { amount: true },
    });
    const fulfillmentRevenue = await this.prisma.adminWalletTransaction.aggregate({
      where: { adminWalletId: walletId, type: 'CREDIT', source: 'FULFILLMENT' },
      _sum: { amount: true },
    });
    const fundingDisbursed = await this.prisma.adminWalletTransaction.aggregate({
      where: { adminWalletId: walletId, type: 'DEBIT', source: 'FUNDING' },
      _sum: { amount: true },
    });

    const merchantBalances = await this.prisma.merchant.aggregate({
      _sum: { walletBalance: true },
    });

    return {
      id: wallet.id,
      balance: wallet.balance,
      currency: wallet.currency,
      total_credits: totalCredits._sum.amount || 0,
      total_debits: totalDebits._sum.amount || 0,
      fulfillment_revenue: fulfillmentRevenue._sum.amount || 0,
      funding_disbursed: fundingDisbursed._sum.amount || 0,
      total_merchant_balances: merchantBalances._sum.walletBalance || 0,
      total_platform_funds: (wallet.balance as any) + (merchantBalances._sum.walletBalance as any || 0),
      recent_transactions: wallet.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balance_after: t.balanceAfter,
        reference_id: t.referenceId,
        source: t.source,
        description: t.description,
        created_at: t.createdAt,
      })),
      funding_requests: wallet.fundingRequests.map((r) => ({
        id: r.id,
        merchant: r.merchant,
        amount: r.amount,
        currency: r.currency,
        note: r.note,
        status: r.status,
        admin_note: r.adminNote,
        reviewed_by: r.reviewedBy,
        reviewed_at: r.reviewedAt,
        created_at: r.createdAt,
      })),
    };
  }

  async initializeAdminWallet(amount: number, description: string, adminId: string, ip?: string) {
    const walletId = await this.getOrCreateAdminWallet();
    const wallet = await this.prisma.adminWallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Admin wallet not found');

    const newBalance = Number(wallet.balance) + amount;

    const [updatedWallet, txn] = await this.prisma.$transaction([
      this.prisma.adminWallet.update({
        where: { id: walletId },
        data: { balance: newBalance },
      }),
      this.prisma.adminWalletTransaction.create({
        data: {
          adminWalletId: walletId,
          type: 'CREDIT',
          amount,
          balanceAfter: newBalance,
          source: 'MANUAL',
          description: description || `Manual funding by admin ${adminId}`,
        },
      }),
    ]);

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.wallet_initialize',
      entity: 'AdminWallet',
      entityId: walletId,
      metadata: { amount, description },
      ip,
    });

    return {
      success: true,
      wallet_id: walletId,
      new_balance: updatedWallet.balance,
      transaction_id: txn.id,
    };
  }

  async getAdminWalletTransactions(limit = 50, offset = 0) {
    const walletId = await this.getOrCreateAdminWallet();
    const [txns, total] = await Promise.all([
      this.prisma.adminWalletTransaction.findMany({
        where: { adminWalletId: walletId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.adminWalletTransaction.count({ where: { adminWalletId: walletId } }),
    ]);
    return {
      items: txns.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balance_after: t.balanceAfter,
        reference_id: t.referenceId,
        source: t.source,
        description: t.description,
        created_at: t.createdAt,
      })),
      total,
    };
  }

  // ─── Funding Requests ───

  async createFundingRequest(merchantId: string, amount: number, note?: string, screenshot?: string) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    if (!screenshot) {
      throw new BadRequestException('A payment screenshot/proof is required');
    }

    const adminWalletId = await this.getOrCreateAdminWallet();
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const request = await this.prisma.fundingRequest.create({
      data: {
        merchantId,
        adminWalletId,
        amount,
        currency: merchant.currency || 'USD',
        note,
        screenshot,
        status: 'PENDING',
      },
    });

    this.logger.log(`Funding request created: ${request.id} for merchant ${merchantId} amount ${amount}`);
    return {
      id: request.id,
      amount: request.amount,
      currency: request.currency,
      note: request.note,
      status: request.status,
      created_at: request.createdAt,
    };
  }

  async listFundingRequests(merchantId?: string, status?: string) {
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;
    if (status) where.status = status;

    const requests = await this.prisma.fundingRequest.findMany({
      where,
      include: {
        merchant: { select: { id: true, name: true, email: true, walletBalance: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return requests.map((r) => ({
      id: r.id,
      merchant: r.merchant,
      amount: r.amount,
      currency: r.currency,
      note: r.note,
      has_screenshot: !!r.screenshot,
      screenshot: r.screenshot,
      status: r.status,
      admin_note: r.adminNote,
      reviewed_by: r.reviewedBy,
      reviewed_at: r.reviewedAt,
      created_at: r.createdAt,
    }));
  }

  async approveFundingRequest(requestId: string, adminId: string, adminNote?: string, ip?: string, editedAmount?: number) {
    const request = await this.prisma.fundingRequest.findUnique({
      where: { id: requestId },
      include: { merchant: true },
    });

    if (!request) {
      throw new NotFoundException('Funding request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Funding request already ${request.status}`);
    }

    // Admin can edit the amount before approving
    const finalAmount = editedAmount !== undefined && editedAmount > 0 ? editedAmount : Number(request.amount);

    // Admin wallet ID still needed for FK, but no balance check or debit
    const adminWalletId = await this.getOrCreateAdminWallet();

    // Atomic: credit merchant wallet + create transaction + update funding request
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Credit merchant wallet
      const updatedMerchant = await tx.merchant.update({
        where: { id: request.merchantId },
        data: { walletBalance: { increment: finalAmount } },
      });

      // 2. Create merchant wallet transaction
      await tx.walletTransaction.create({
        data: {
          merchantId: request.merchantId,
          type: 'CREDIT',
          amount: finalAmount,
          balanceAfter: updatedMerchant.walletBalance,
          referenceId: requestId,
        },
      });

      // 3. Update funding request with final amount
      const updatedRequest = await tx.fundingRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          amount: finalAmount,
          adminNote: adminNote || (editedAmount !== undefined && editedAmount !== Number(request.amount) ? `Amount edited from ${request.amount} to ${finalAmount}` : undefined),
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });

      return { updatedRequest, updatedMerchant };
    });

    // Audit log
    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'funding.approve',
      entity: 'FundingRequest',
      entityId: requestId,
      metadata: {
        merchantId: request.merchantId,
        originalAmount: Number(request.amount),
        finalAmount,
        edited: editedAmount !== undefined && editedAmount !== Number(request.amount),
        merchantBalanceAfter: result.updatedMerchant.walletBalance,
      },
      ip,
    });

    this.logger.log(`Funding request ${requestId} approved. Merchant ${request.merchantId} credited ${finalAmount}`);

    return {
      id: result.updatedRequest.id,
      status: result.updatedRequest.status,
      amount: result.updatedRequest.amount,
      admin_note: result.updatedRequest.adminNote,
      reviewed_at: result.updatedRequest.reviewedAt,
      merchant_new_balance: result.updatedMerchant.walletBalance,
    };
  }

  async rejectFundingRequest(requestId: string, adminId: string, adminNote?: string, ip?: string) {
    const request = await this.prisma.fundingRequest.findUnique({ where: { id: requestId } });

    if (!request) {
      throw new NotFoundException('Funding request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Funding request already ${request.status}`);
    }

    const updated = await this.prisma.fundingRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        adminNote,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'funding.reject',
      entity: 'FundingRequest',
      entityId: requestId,
      metadata: { merchantId: request.merchantId, amount: request.amount },
      ip,
    });

    this.logger.log(`Funding request ${requestId} rejected`);

    return {
      id: updated.id,
      status: updated.status,
      admin_note: updated.adminNote,
      reviewed_at: updated.reviewedAt,
    };
  }

  // ─── Reconciliation ───

  async getPlatformFinanceOverview() {
    // Get admin-configured exchange rate (USD to PKR)
    const rateSetting = await this.prisma.platformSetting.findUnique({ where: { key: 'USD_TO_PKR_RATE' } });
    const usdToPkrRate = rateSetting ? parseFloat(rateSetting.value) : 280; // default 280

    // Aggregate merchant balances grouped by currency
    const merchants = await this.prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      select: { walletBalance: true, currency: true },
    });

    const balancesByCurrency: Record<string, number> = {};
    for (const m of merchants) {
      const cur = m.currency || 'USD';
      if (!balancesByCurrency[cur]) balancesByCurrency[cur] = 0;
      balancesByCurrency[cur] += Number(m.walletBalance);
    }

    // Cost basis in USDT: sum of all fulfilled order costs (from wallet debits for fulfilled orders)
    const fulfilledDebits = await this.prisma.walletTransaction.aggregate({
      where: { type: 'DEBIT' },
      _sum: { amount: true },
    });

    // Total fulfillment revenue (from admin wallet credits)
    const adminWalletId = await this.getOrCreateAdminWallet();
    const fulfillmentRevenue = await this.prisma.adminWalletTransaction.aggregate({
      where: { adminWalletId, type: 'CREDIT', source: 'FULFILLMENT' },
      _sum: { amount: true },
    });

    // Total funding disbursed
    const fundingDisbursed = await this.prisma.adminWalletTransaction.aggregate({
      where: { adminWalletId, type: 'DEBIT', source: 'FUNDING' },
      _sum: { amount: true },
    });

    // Count active merchants
    const activeMerchantCount = merchants.length;

    return {
      balances_by_currency: balancesByCurrency,
      total_usd_balance: balancesByCurrency['USD'] || 0,
      total_pkr_balance: balancesByCurrency['PKR'] || 0,
      total_eur_balance: balancesByCurrency['EUR'] || 0,
      cost_basis_usdt: Number(fulfilledDebits._sum.amount) || 0,
      fulfillment_revenue: Number(fulfillmentRevenue._sum.amount) || 0,
      funding_disbursed: Number(fundingDisbursed._sum.amount) || 0,
      active_merchant_count: activeMerchantCount,
      usd_to_pkr_rate: usdToPkrRate,
    };
  }

  async updateExchangeRate(rate: number, adminId: string) {
    if (rate <= 0) throw new BadRequestException('Exchange rate must be greater than 0');
    await this.prisma.platformSetting.upsert({
      where: { key: 'USD_TO_PKR_RATE' },
      create: { key: 'USD_TO_PKR_RATE', value: String(rate) },
      update: { value: String(rate) },
    });
    this.logger.log(`USD to PKR rate updated to ${rate} by admin ${adminId}`);
    return { key: 'USD_TO_PKR_RATE', value: String(rate) };
  }

  async getReconciliationReport(limit = 100, offset = 0) {
    const [fulfillments, total] = await Promise.all([
      this.prisma.fulfillmentRequest.findMany({
        where: { walletCharged: true },
        include: {
          merchant: { select: { id: true, name: true, email: true } },
          walletTxn: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.fulfillmentRequest.count({ where: { walletCharged: true } }),
    ]);

    const walletId = await this.getOrCreateAdminWallet();

    const items = [];
    let mismatchCount = 0;

    for (const f of fulfillments) {
      const adminTxn = await this.prisma.adminWalletTransaction.findFirst({
        where: { referenceId: f.id, source: 'FULFILLMENT' },
      });

      const merchantDebit = f.walletTxn ? Number(f.walletTxn.amount) : null;
      const adminCredit = adminTxn ? Number(adminTxn.amount) : null;
      const matched = merchantDebit !== null && adminCredit !== null && merchantDebit === adminCredit;

      if (!matched) mismatchCount++;

      items.push({
        fulfillment_id: f.id,
        merchant: f.merchant,
        amount: f.amount,
        status: f.status,
        reference_id: f.referenceId,
        created_at: f.createdAt,
        merchant_debit: merchantDebit,
        admin_credit: adminCredit,
        matched,
      });
    }

    return {
      items,
      total,
      mismatch_count: mismatchCount,
      all_matched: mismatchCount === 0,
    };
  }

  // ─── Merchant Finance Detail ───

  async getMerchantFinanceDetail(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        walletTxns: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        fundingRequests: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const totalDebits = await this.prisma.walletTransaction.aggregate({
      where: { merchantId, type: 'DEBIT' },
      _sum: { amount: true },
    });
    const totalCredits = await this.prisma.walletTransaction.aggregate({
      where: { merchantId, type: 'CREDIT' },
      _sum: { amount: true },
    });
    const totalRefunds = await this.prisma.walletTransaction.aggregate({
      where: { merchantId, type: 'REFUND' },
      _sum: { amount: true },
    });

    return {
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        current_balance: merchant.walletBalance,
        currency: merchant.currency,
      },
      total_deposited: totalCredits._sum.amount || 0,
      total_spent: totalDebits._sum.amount || 0,
      total_refunds: totalRefunds._sum.amount || 0,
      recent_transactions: merchant.walletTxns.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balance_after: t.balanceAfter,
        reference_id: t.referenceId,
        fulfillment_id: t.fulfillmentId,
        created_at: t.createdAt,
      })),
      funding_requests: merchant.fundingRequests.map((r) => ({
        id: r.id,
        amount: r.amount,
        status: r.status,
        note: r.note,
        admin_note: r.adminNote,
        created_at: r.createdAt,
        reviewed_at: r.reviewedAt,
      })),
    };
  }
}
