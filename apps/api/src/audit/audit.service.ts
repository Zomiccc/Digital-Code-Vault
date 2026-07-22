import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: input.actorType,
          actorId: input.actorId || null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId || null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          ip: input.ip || null,
        },
      });
    } catch (err) {
      // Audit logging should never break the main operation
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
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
