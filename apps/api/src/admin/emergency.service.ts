import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export const EMERGENCY_STOP_KEY = 'EMERGENCY_STOP';
export const EMERGENCY_MESSAGE_KEY = 'EMERGENCY_STOP_MESSAGE';

const DEFAULT_MESSAGE =
  'Code delivery is paused by the platform administrator. Orders cannot be placed right now.';

/**
 * The controls used when something is going wrong: stop everything, or freeze
 * one merchant, one product, or one API key.
 *
 * Each control reuses the flag the rest of the platform already enforces, so
 * freezing genuinely blocks delivery rather than only hiding a button:
 * fulfillment refuses a merchant or product that is not ACTIVE, and API-key
 * verification only matches keys that are ACTIVE.
 */
@Injectable()
export class EmergencyService {
  private readonly logger = new Logger(EmergencyService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * A count that cannot take the page down.
   *
   * This screen is the one an admin reaches for when something is already
   * wrong, so a single failing query must not turn it into a 500 with no
   * explanation. A failed count reports as -1 and logs why.
   */
  private async safeCount(label: string, run: () => Promise<number>): Promise<number> {
    try {
      return await run();
    } catch (err) {
      this.logger.error(`Emergency status: ${label} count failed: ${(err as Error).message}`);
      return -1;
    }
  }

  async getStatus() {
    const [stop, message, merchants, frozenMerchants, products, frozenProducts, keys, disabledKeys] =
      await Promise.all([
        this.prisma.platformSetting.findUnique({ where: { key: EMERGENCY_STOP_KEY } })
          .catch((err: Error) => {
            this.logger.error(`Emergency status: reading the stop flag failed: ${err.message}`);
            return null;
          }),
        this.prisma.platformSetting.findUnique({ where: { key: EMERGENCY_MESSAGE_KEY } })
          .catch(() => null),
        this.safeCount('merchants', () => this.prisma.merchant.count()),
        this.safeCount('frozen merchants', () => this.prisma.merchant.count({ where: { NOT: { status: 'ACTIVE' } } })),
        this.safeCount('products', () => this.prisma.product.count()),
        this.safeCount('frozen products', () => this.prisma.product.count({ where: { NOT: { status: 'ACTIVE' } } })),
        this.safeCount('api keys', () => this.prisma.apiKey.count()),
        this.safeCount('disabled api keys', () => this.prisma.apiKey.count({ where: { NOT: { status: 'ACTIVE' } } })),
      ]);

    return {
      global_stop: stop?.value === 'true',
      message: message?.value || DEFAULT_MESSAGE,
      updated_at: stop?.updatedAt || null,
      merchants: { total: merchants, frozen: frozenMerchants },
      products: { total: products, frozen: frozenProducts },
      api_keys: { total: keys, disabled: disabledKeys },
    };
  }

  /** What a merchant is told: the platform state plus their own. */
  async getStatusForMerchant(merchantId: string) {
    const [stop, message, merchant] = await Promise.all([
      this.prisma.platformSetting.findUnique({ where: { key: EMERGENCY_STOP_KEY } }),
      this.prisma.platformSetting.findUnique({ where: { key: EMERGENCY_MESSAGE_KEY } }),
      this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { status: true } }),
    ]);
    const globalStop = stop?.value === 'true';
    const accountFrozen = !!merchant && merchant.status !== 'ACTIVE';
    return {
      ordering_paused: globalStop || accountFrozen,
      global_stop: globalStop,
      account_frozen: accountFrozen,
      account_status: merchant?.status || 'UNKNOWN',
      message: globalStop
        ? message?.value || DEFAULT_MESSAGE
        : accountFrozen
          ? 'Your account is currently on hold. Please contact support.'
          : null,
    };
  }

  async setGlobalStop(enabled: boolean, message: string | undefined, adminId: string, ip?: string) {
    await this.prisma.platformSetting.upsert({
      where: { key: EMERGENCY_STOP_KEY },
      create: { key: EMERGENCY_STOP_KEY, value: enabled ? 'true' : 'false' },
      update: { value: enabled ? 'true' : 'false' },
    });
    if (message !== undefined) {
      await this.prisma.platformSetting.upsert({
        where: { key: EMERGENCY_MESSAGE_KEY },
        create: { key: EMERGENCY_MESSAGE_KEY, value: message || DEFAULT_MESSAGE },
        update: { value: message || DEFAULT_MESSAGE },
      });
    }
    await this.log(adminId, 'emergency.global_stop', 'PlatformSetting', EMERGENCY_STOP_KEY, { enabled }, ip);
    this.logger.warn(`Emergency stop ${enabled ? 'ENABLED' : 'disabled'} by admin ${adminId}`);
    return this.getStatus();
  }

  async setMerchantFrozen(merchantId: string, frozen: boolean, adminId: string, ip?: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { status: frozen ? 'SUSPENDED' : 'ACTIVE' },
    });
    await this.log(adminId, 'emergency.merchant_freeze', 'Merchant', merchantId,
      { frozen, from: merchant.status }, ip);
    return { id: merchantId, status: frozen ? 'SUSPENDED' : 'ACTIVE' };
  }

  /**
   * Freeze or release every merchant at once. Releasing only touches merchants
   * this control suspended, so a merchant disabled for another reason is not
   * quietly reactivated.
   */
  async setAllMerchantsFrozen(frozen: boolean, adminId: string, ip?: string) {
    const result = frozen
      ? await this.prisma.merchant.updateMany({
          where: { status: 'ACTIVE' },
          data: { status: 'SUSPENDED' },
        })
      : await this.prisma.merchant.updateMany({
          where: { status: 'SUSPENDED' },
          data: { status: 'ACTIVE' },
        });
    await this.log(adminId, 'emergency.all_merchants_freeze', 'Merchant', 'bulk',
      { frozen, affected: result.count }, ip);
    this.logger.warn(`${frozen ? 'Froze' : 'Released'} ${result.count} merchant(s) by admin ${adminId}`);
    return { affected: result.count, frozen };
  }

  async setProductFrozen(productId: string, frozen: boolean, adminId: string, ip?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    await this.prisma.product.update({
      where: { id: productId },
      data: { status: frozen ? 'DISABLED' : 'ACTIVE' },
    });
    await this.log(adminId, 'emergency.product_freeze', 'Product', productId,
      { frozen, from: product.status }, ip);
    return { id: productId, status: frozen ? 'DISABLED' : 'ACTIVE' };
  }

  async setApiKeyDisabled(apiKeyId: string, disabled: boolean, adminId: string, ip?: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id: apiKeyId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { status: disabled ? 'DISABLED' : 'ACTIVE', revokedAt: disabled ? new Date() : null },
    });
    await this.log(adminId, 'emergency.api_key_disable', 'ApiKey', apiKeyId,
      { disabled, merchantId: key.merchantId }, ip);
    return { id: apiKeyId, status: disabled ? 'DISABLED' : 'ACTIVE' };
  }

  /**
   * Exactly what deleting a merchant would destroy, so an admin sees it before
   * confirming rather than after. Deleting cascades to the merchant's users, API
   * keys, wallet history, orders, funding requests, support messages and
   * connected products — none of which can be recovered.
   */
  async previewMerchantDeletion(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, name: true, email: true, status: true, walletBalance: true, currency: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const [users, apiKeys, orders, walletTxns, fundingRequests, ownedCodes, deliveredCodes, products, connected] =
      await Promise.all([
        this.prisma.merchantUser.count({ where: { merchantId } }),
        this.prisma.apiKey.count({ where: { merchantId } }),
        this.prisma.fulfillmentRequest.count({ where: { merchantId } }),
        this.prisma.walletTransaction.count({ where: { merchantId } }),
        this.prisma.fundingRequest.count({ where: { merchantId } }),
        this.prisma.codeItem.count({ where: { merchantId } }),
        this.prisma.codeItem.count({ where: { merchantId, status: 'DELIVERED' } }),
        this.prisma.product.count({ where: { merchantId } }),
        this.prisma.connectedProduct.count({ where: { merchantId } }),
      ]);

    const balance = Number(merchant.walletBalance);
    const blockers: string[] = [];
    // Money must be accounted for first: deleting a funded wallet makes the
    // balance disappear with no record of where it went.
    if (balance > 0) {
      blockers.push(
        `Wallet still holds ${balance} ${merchant.currency || 'USD'} — refund or zero it before deleting.`,
      );
    }

    return {
      merchant: {
        id: merchant.id, name: merchant.name, email: merchant.email,
        status: merchant.status, balance, currency: merchant.currency || 'USD',
      },
      // Deleted along with the merchant, permanently.
      will_delete: {
        logins: users,
        api_keys: apiKeys,
        orders,
        wallet_transactions: walletTxns,
        funding_requests: fundingRequests,
        connected_products: connected,
      },
      // Kept: codes are inventory and are detached rather than destroyed, and
      // merchant-owned products simply lose their owner.
      will_keep: {
        codes_released_to_platform: ownedCodes,
        codes_already_delivered: deliveredCodes,
        products_unassigned: products,
      },
      blockers,
      can_delete: blockers.length === 0,
    };
  }

  /**
   * Delete a merchant for good.
   *
   * Two things are deliberately not left to the cascade. The schema cascades
   * CodeItem from Merchant, so deleting would destroy that merchant's codes —
   * real encrypted stock, including the record of codes already delivered — so
   * they are detached to the platform first and survive. And the name must be
   * typed back, because there is no undo and the rows are gone the moment this
   * returns.
   *
   * Freezing the account is almost always the better answer; this exists for
   * removing test accounts and genuine mistakes.
   */
  async deleteMerchant(merchantId: string, confirmName: string, adminId: string, ip?: string) {
    const preview = await this.previewMerchantDeletion(merchantId);

    if ((confirmName || '').trim() !== preview.merchant.name.trim()) {
      throw new BadRequestException(
        `Type the merchant's name exactly ("${preview.merchant.name}") to confirm deletion`,
      );
    }
    if (!preview.can_delete) {
      throw new BadRequestException(preview.blockers.join(' '));
    }

    const released = await this.prisma.$transaction(async (tx) => {
      // Detach stock before the cascade can take it.
      const detached = await tx.codeItem.updateMany({
        where: { merchantId },
        data: { merchantId: null },
      });
      await tx.merchant.delete({ where: { id: merchantId } });
      return detached.count;
    }, { timeout: 60_000, maxWait: 15_000 });

    await this.log(adminId, 'emergency.merchant_delete', 'Merchant', merchantId, {
      name: preview.merchant.name,
      email: preview.merchant.email,
      deleted: preview.will_delete,
      codes_released: released,
    }, ip);
    this.logger.warn(
      `Merchant "${preview.merchant.name}" (${merchantId}) deleted by admin ${adminId}; ` +
      `${released} code(s) released to the platform`,
    );

    return { deleted: true, id: merchantId, name: preview.merchant.name, codes_released: released };
  }

  /** Merchants, products and API keys with their current frozen state. */
  async listControllable() {
    const [merchants, products, apiKeys] = await Promise.all([
      this.prisma.merchant.findMany({
        select: { id: true, name: true, email: true, status: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.findMany({
        select: { id: true, name: true, region: true, status: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.apiKey.findMany({
        select: {
          id: true, keyPrefix: true, status: true, lastUsedAt: true,
          merchant: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    return {
      merchants,
      products,
      api_keys: apiKeys.map((key) => ({
        id: key.id,
        prefix: key.keyPrefix,
        status: key.status,
        last_used_at: key.lastUsedAt,
        merchant: key.merchant,
      })),
    };
  }

  private log(
    adminId: string, action: string, entity: string, entityId: string,
    metadata: Record<string, unknown>, ip?: string,
  ) {
    return this.auditService.log({
      actorType: 'ADMIN', actorId: adminId, action, entity, entityId, metadata, ip,
    });
  }
}
