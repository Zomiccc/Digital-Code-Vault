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
    // Admin bootstrap is a convenience, not a hard requirement for the app to
    // serve traffic. If the database is unreachable at boot (bad credentials,
    // network hiccup, pooler restart) we log loudly but let the process keep
    // starting so it can still call listen() — otherwise the whole deployment
    // dies and every request 503s instead of surfacing a readable error.
    try {
      await this.bootstrapAdmin();
    } catch (err) {
      this.logger.error(
        `Admin bootstrap failed — continuing startup. Fix the database connection and restart. Error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
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
      // Never overwrite an existing admin's password on boot — this would let anyone
      // with read access to the .env file silently take over an already-configured
      // production admin account every time the server restarts.
      this.logger.log(`Admin user ${email} already exists — skipping bootstrap (password left unchanged)`);
      return;
    }

    // Also guard against the case where ANY admin already exists but not with this
    // exact bootstrap email (e.g. email was rotated) — only auto-create when the
    // platform has zero admins, to avoid silently creating a duplicate superadmin.
    const anyAdmin = await this.prisma.adminUser.count();
    if (anyAdmin > 0) {
      this.logger.log('Admin users already exist — skipping bootstrap admin creation');
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
