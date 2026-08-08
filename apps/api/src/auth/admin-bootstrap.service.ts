import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {}

  async onModuleInit() {
    await this.bootstrapAdmin();
  }

  private async bootstrapAdmin() {
    const email = this.configService.get<string>('ADMIN_BOOTSTRAP_EMAIL');
    const password = this.configService.get<string>('ADMIN_BOOTSTRAP_PASSWORD');
    const name = this.configService.get<string>('ADMIN_BOOTSTRAP_NAME', 'Super Admin');

    if (!email || !password) {
      this.logger.log('No ADMIN_BOOTSTRAP_EMAIL/PASSWORD set, skipping admin bootstrap');
      return;
    }

    const existing = await this.prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      // In dev mode, update the password to match the configured one
      const passwordHash = await argon2.hash(password);
      await this.prisma.adminUser.update({
        where: { email },
        data: { passwordHash, isActive: true },
      });
      this.logger.log(`Admin user ${email} already exists, password updated to match config`);
      return;
    }

    const passwordHash = await argon2.hash(password);
    const admin = await this.prisma.adminUser.create({
      data: {
        email,
        name,
        passwordHash,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });

    await this.auditService.log({
      actorType: 'SYSTEM',
      action: 'admin.bootstrap',
      entity: 'AdminUser',
      entityId: admin.id,
      metadata: { email, name },
    });

    this.logger.log(`Bootstrapped super admin: ${email}`);
  }
}
