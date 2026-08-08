import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

export interface AuditLogInput {
  actorType: string;
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  private computeEntryHash(data: {
    actorType: string;
    actorId: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    metadata: string | null;
    ip: string | null;
    createdAt: Date;
    prevHash: string | null;
  }): string {
    const payload = JSON.stringify({
      actorType: data.actorType,
      actorId: data.actorId,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId,
      metadata: data.metadata,
      ip: data.ip,
      createdAt: data.createdAt.toISOString(),
      prevHash: data.prevHash,
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  async log(input: AuditLogInput): Promise<void> {
    try {
      const lastEntry = await this.prisma.auditLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { entryHash: true },
      });

      const prevHash = lastEntry?.entryHash || null;
      const createdAt = new Date();
      const metadataStr = input.metadata ? JSON.stringify(input.metadata) : null;

      const entryHash = this.computeEntryHash({
        actorType: input.actorType,
        actorId: input.actorId || null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId || null,
        metadata: metadataStr,
        ip: input.ip || null,
        createdAt,
        prevHash,
      });

      await this.prisma.auditLog.create({
        data: {
          actorType: input.actorType,
          actorId: input.actorId || null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId || null,
          metadata: metadataStr,
          ip: input.ip || null,
          prevHash,
          entryHash,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }

  async verifyChain(limit = 1000): Promise<{ valid: boolean; brokenAt?: string }> {
    const entries = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        actorType: true,
        actorId: true,
        action: true,
        entity: true,
        entityId: true,
        metadata: true,
        ip: true,
        createdAt: true,
        prevHash: true,
        entryHash: true,
      },
    });

    let expectedPrevHash: string | null = null;
    for (const entry of entries) {
      if (entry.prevHash !== expectedPrevHash) {
        return { valid: false, brokenAt: entry.id };
      }
      const computedHash = this.computeEntryHash({
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ip: entry.ip,
        createdAt: entry.createdAt,
        prevHash: entry.prevHash,
      });
      if (computedHash !== entry.entryHash) {
        return { valid: false, brokenAt: entry.id };
      }
      expectedPrevHash = entry.entryHash;
    }
    return { valid: true };
  }

  async getLogs(options: {
    actorType?: string;
    actorId?: string;
    entity?: string;
    entityId?: string;
    action?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (options.actorType) where.actorType = options.actorType;
    if (options.actorId) where.actorId = options.actorId;
    if (options.entity) where.entity = options.entity;
    if (options.entityId) where.entityId = options.entityId;
    if (options.action) where.action = { contains: options.action };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }
}
