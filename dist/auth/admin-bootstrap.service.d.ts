import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
export declare class AdminBootstrapService implements OnModuleInit {
    private prisma;
    private configService;
    private auditService;
    private readonly logger;
    constructor(prisma: PrismaService, configService: ConfigService, auditService: AuditService);
    onModuleInit(): Promise<void>;
    private bootstrapAdmin;
}
