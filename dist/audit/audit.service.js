"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuditService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const crypto = __importStar(require("crypto"));
let AuditService = AuditService_1 = class AuditService {
    prisma;
    logger = new common_1.Logger(AuditService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    computeEntryHash(data) {
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
    async log(input) {
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
        }
        catch (err) {
            this.logger.error(`Failed to write audit log: ${err.message}`);
        }
    }
    async verifyChain(limit = 1000) {
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
        let expectedPrevHash = null;
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
    async getLogs(options) {
        const where = {};
        if (options.actorType)
            where.actorType = options.actorType;
        if (options.actorId)
            where.actorId = options.actorId;
        if (options.entity)
            where.entity = options.entity;
        if (options.entityId)
            where.entityId = options.entityId;
        if (options.action)
            where.action = { contains: options.action };
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
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = AuditService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditService);
//# sourceMappingURL=audit.service.js.map