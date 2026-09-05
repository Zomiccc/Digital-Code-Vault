import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

  async getStatus() {
    const [stop, message, merchants, frozenMerchants, products, frozenProducts, keys, disabledKeys] =
      await Promise.all([
        this.prisma.platformSetting.findUnique({ where: { key: EMERGENCY_STOP_KEY } }),
        this.prisma.platformSetting.findUnique({ where: { key: EMERGENCY_MESSAGE_KEY } }),
        this.prisma.merchant.count(),
        this.prisma.merchant.count({ where: { NOT: { status: 'ACTIVE' } } }),
        this.prisma.product.count(),
        this.prisma.product.count({ where: { NOT: { status: 'ACTIVE' } } }),
        this.prisma.apiKey.count(),
        this.prisma.apiKey.count({ where: { NOT: { status: 'ACTIVE' } } }),
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
