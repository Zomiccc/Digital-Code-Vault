import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { nanoid } from 'nanoid';

@Injectable()
export class CodesService {
  private readonly logger = new Logger(CodesService.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private auditService: AuditService,
    private fulfillmentService: FulfillmentService,
  ) {}

  /**
   * Bulk upload codes via CSV-like array of { denominationId, code }.
   * Codes are encrypted at rest. Duplicates detected via codeHash.
   */
  async bulkUpload(
    denominationId: string,
    codes: string[],
    adminId: string,
    supplierId?: string,
    ip?: string,
    costInfo?: { costPerCode?: number; currency?: string; note?: string },
  ) {
    // Verify denomination exists
    const denomination = await this.prisma.denomination.findUnique({
      where: { id: denominationId },
    });
    if (!denomination) {
      throw new NotFoundException('Denomination not found');
    }

    const batchId = nanoid(16);
    const results: { inserted: number; duplicates: number; errors: string[] } = {
      inserted: 0,
      duplicates: 0,
      errors: [],
    };

    // Get existing hashes for this denomination to detect duplicates
    const existingHashes = new Set<string>();
    const existingItems = await this.prisma.codeItem.findMany({
      where: { denominationId },
      select: { codeHash: true },
    });
    for (const item of existingItems) {
      existingHashes.add(item.codeHash);
    }

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i].trim();
      if (!code) {
        results.errors.push(`Row ${i + 1}: empty code`);
        continue;
      }

      const codeHash = this.encryptionService.hashCode(code);

      // Check for duplicates within the batch and existing
      if (existingHashes.has(codeHash)) {
        results.duplicates++;
        continue;
      }
      existingHashes.add(codeHash);

      // Encrypt the code
      const encryptedCode = this.encryptionService.encrypt(code);

      try {
        await this.prisma.codeItem.create({
          data: {
            denominationId,
            encryptedCode,
            codeHash,
            status: 'AVAILABLE',
            batchId,
            supplierId,
          },
        });
        results.inserted++;
      } catch (err) {
        results.errors.push(`Row ${i + 1}: ${(err as Error).message}`);
      }
    }

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'codes.bulk_upload',
      entity: 'Denomination',
      entityId: denominationId,
      metadata: {
        batchId,
        total: codes.length,
        inserted: results.inserted,
        duplicates: results.duplicates,
        errors: results.errors.length,
        supplierId: supplierId || null,
        costPerCode: costInfo?.costPerCode ?? null,
        currency: costInfo?.currency ?? null,
      },
      ip,
    });

    // Record batch cost/supplier info for bookkeeping (even if 0 inserted, keep record)
    await this.prisma.codeBatch.create({
      data: {
        id: batchId,
        denominationId,
        quantity: codes.length,
        supplierId: supplierId || null,
        costPerCode: costInfo?.costPerCode ?? null,
        currency: costInfo?.currency || 'USD',
        note: costInfo?.note || null,
        createdBy: adminId,
      },
    }).catch(() => {});

    this.logger.log(
      `Bulk upload: ${results.inserted} inserted, ${results.duplicates} duplicates, ${results.errors.length} errors (batch ${batchId})`,
    );

    // Auto-fulfill pending supplier requests now that new codes are available
    if (results.inserted > 0) {
      const denomination = await this.prisma.denomination.findUnique({
        where: { id: denominationId },
        select: { productId: true },
      });
      if (denomination) {
        this.fulfillmentService.fulfillPendingSupplierRequests(denomination.productId).catch((err) => {
          this.logger.error(`Auto-fulfill failed: ${err.message}`);
        });
      }
    }

    return { batchId, ...results };
  }

  /**
   * List code items with masked display (never returns raw codes).
   */
  async listCodes(options: {
    denominationId?: string;
    status?: string;
    batchId?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (options.denominationId) where.denominationId = options.denominationId;
    if (options.status) where.status = options.status;
    if (options.batchId) where.batchId = options.batchId;

    const [items, total] = await Promise.all([
      this.prisma.codeItem.findMany({
        where,
        include: {
          denomination: {
            include: { product: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      this.prisma.codeItem.count({ where }),
    ]);

    // Mask codes — never return raw codes in list view
    return {
      items: items.map((item) => ({
        id: item.id,
        denomination: {
          id: item.denomination.id,
          face_value: item.denomination.faceValue,
          product: item.denomination.product.name,
          region: item.denomination.product.region,
        },
        status: item.status,
        batch_id: item.batchId,
        reserved_until: item.reservedUntil,
        revealed_at: item.revealedAt,
        created_at: item.createdAt,
        // Masked — last 4 chars only
        masked_code: '****',
      })),
      total,
    };
  }

  /**
   * Admin reveal a single code (requires SUPER_ADMIN or INVENTORY_MANAGER).
   * Decrypts the code in-memory, enforces one-time reveal, logs the action.
   */
  async revealCode(codeItemId: string, adminId: string, ip?: string) {
    const item = await this.prisma.codeItem.findUnique({
      where: { id: codeItemId },
      include: { denomination: { include: { product: true } } },
    });

    if (!item) {
      throw new NotFoundException('Code item not found');
    }

    if (item.status === 'DELIVERED') {
      throw new BadRequestException('Code has already been revealed');
    }

    if (item.status === 'VOIDED') {
      throw new BadRequestException('Code has been voided and cannot be revealed');
    }

    const plaintext = this.encryptionService.decrypt(item.encryptedCode);

    await this.prisma.codeItem.update({
      where: { id: codeItemId },
      data: {
        status: 'DELIVERED',
        revealedAt: new Date(),
        revealedIp: ip || null,
        reservedUntil: null,
        reservedByReqId: null,
      },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'codes.reveal',
      entity: 'CodeItem',
      entityId: codeItemId,
      metadata: {
        denomination: item.denomination.faceValue,
        product: item.denomination.product.name,
      },
      ip,
    });

    return {
      id: item.id,
      code: plaintext,
      masked: this.encryptionService.maskCode(plaintext),
      denomination: item.denomination.faceValue,
      product: item.denomination.product.name,
      status: 'DELIVERED',
    };
  }

  /**
   * Void a code item (mark as VOID).
   */
  async voidCode(codeItemId: string, adminId: string, ip?: string) {
    const item = await this.prisma.codeItem.findUnique({ where: { id: codeItemId } });
    if (!item) throw new NotFoundException('Code item not found');

    if (item.status === 'DELIVERED') {
      throw new BadRequestException('Cannot void a delivered code');
    }

    await this.prisma.codeItem.update({
      where: { id: codeItemId },
      data: { status: 'VOIDED', reservedUntil: null, reservedByReqId: null },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'codes.void',
      entity: 'CodeItem',
      entityId: codeItemId,
      ip,
    });

    return { success: true };
  }

  /**
   * Get inventory stats by status
   */
  async getInventoryStats() {
    const stats = await this.prisma.codeItem.groupBy({
      by: ['status'],
      _count: true,
    });

    const result: Record<string, number> = {};
    for (const s of stats) {
      result[s.status] = s._count;
    }

    return result;
  }

  async merchantBulkUpload(
    denominationId: string,
    codes: string[],
    merchantId: string,
    ip?: string,
  ) {
    const denomination = await this.prisma.denomination.findUnique({
      where: { id: denominationId },
      include: { product: true },
    });
    if (!denomination) {
      throw new NotFoundException('Denomination not found');
    }

    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const allowedIds: string[] = JSON.parse(merchant.allowedProductIds || '[]');
    if (allowedIds.length > 0 && !allowedIds.includes(denomination.productId)) {
      throw new ForbiddenException('Merchant is not allowed to upload codes for this product');
    }

    const batchId = nanoid(16);
    const results: { inserted: number; duplicates: number; errors: string[] } = {
      inserted: 0,
      duplicates: 0,
      errors: [],
    };

    const existingHashes = new Set<string>();
    const existingItems = await this.prisma.codeItem.findMany({
      where: { denominationId },
      select: { codeHash: true },
    });
    for (const item of existingItems) {
      existingHashes.add(item.codeHash);
    }

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i].trim();
      if (!code) {
        results.errors.push(`Row ${i + 1}: empty code`);
        continue;
      }

      const codeHash = this.encryptionService.hashCode(code);

      if (existingHashes.has(codeHash)) {
        results.duplicates++;
        continue;
      }
      existingHashes.add(codeHash);

      const encryptedCode = this.encryptionService.encrypt(code);

      try {
        await this.prisma.codeItem.create({
          data: {
            denominationId,
            encryptedCode,
            codeHash,
            status: 'AVAILABLE',
            batchId,
            merchantId,
            source: 'MERCHANT',
          },
        });
        results.inserted++;
      } catch (err) {
        results.errors.push(`Row ${i + 1}: ${(err as Error).message}`);
      }
    }

    await this.auditService.log({
      actorType: 'MERCHANT',
      actorId: merchantId,
      action: 'codes.merchant_upload',
      entity: 'Denomination',
      entityId: denominationId,
      metadata: {
        batchId,
        total: codes.length,
        inserted: results.inserted,
        duplicates: results.duplicates,
        errors: results.errors.length,
        productName: denomination.product.name,
        faceValue: denomination.faceValue,
      },
      ip,
    });

    this.logger.log(
      `Merchant ${merchantId} bulk upload: ${results.inserted} inserted, ${results.duplicates} duplicates, ${results.errors.length} errors (batch ${batchId})`,
    );

    return { batchId, ...results };
  }

  async listMerchantCodes(
    merchantId: string,
    options: {
      denominationId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Record<string, unknown> = { merchantId };
    if (options.denominationId) where.denominationId = options.denominationId;
    if (options.status) where.status = options.status;

    const [items, total] = await Promise.all([
      this.prisma.codeItem.findMany({
        where,
        include: {
          denomination: {
            include: { product: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      this.prisma.codeItem.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        denomination: {
          id: item.denomination.id,
          face_value: item.denomination.faceValue,
          product: item.denomination.product.name,
          region: item.denomination.product.region,
        },
        status: item.status,
        source: item.source,
        batch_id: item.batchId,
        reserved_until: item.reservedUntil,
        revealed_at: item.revealedAt,
        created_at: item.createdAt,
        masked_code: '****',
      })),
      total,
    };
  }

  async getMerchantInventoryStats(merchantId: string) {
    const stats = await this.prisma.codeItem.groupBy({
      by: ['status', 'source'],
      where: { merchantId },
      _count: true,
    });

    const result: Record<string, Record<string, number>> = {};
    for (const s of stats) {
      if (!result[s.source]) result[s.source] = {};
      result[s.source][s.status] = s._count;
    }

    return result;
  }

  async voidMerchantCode(codeItemId: string, merchantId: string, ip?: string) {
    const item = await this.prisma.codeItem.findUnique({ where: { id: codeItemId } });
    if (!item) throw new NotFoundException('Code item not found');

    if (item.merchantId !== merchantId) {
      throw new ForbiddenException('You do not own this code');
    }

    if (item.status === 'DELIVERED') {
      throw new BadRequestException('Cannot void a delivered code');
    }

    await this.prisma.codeItem.update({
      where: { id: codeItemId },
      data: { status: 'VOIDED', reservedUntil: null, reservedByReqId: null },
    });

    await this.auditService.log({
      actorType: 'MERCHANT',
      actorId: merchantId,
      action: 'codes.merchant_void',
      entity: 'CodeItem',
      entityId: codeItemId,
      ip,
    });

    return { success: true };
  }
}
