import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../encryption/encryption.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    private encryptionService: EncryptionService,
    private emailService: EmailService,
  ) {}

  // ─── Admin Auth ───

  async adminLogin(email: string, password: string, ip?: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(admin.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: admin.id,
      action: 'admin.login',
      entity: 'AdminUser',
      entityId: admin.id,
      ip,
    });

    const tokens = await this.generateAdminTokens(admin.id, admin.email, admin.role);

    return {
      user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      ...tokens,
    };
  }

  async adminRefresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'admin_refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
      if (!admin || !admin.isActive) {
        throw new UnauthorizedException('Account disabled');
      }
      return this.generateAdminTokens(admin.id, admin.email, admin.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateAdminTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role, type: 'admin' };
    const refreshPayload = { sub: userId, type: 'admin_refresh' };

    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    });
    const refresh_token = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return {
      access_token,
      refresh_token,
      expires_in: 900,
    };
  }

  // ─── Emergency Stop ───

  /** True when the admin has flipped the platform-wide emergency switch. */
  async isEmergencyStopActive(): Promise<boolean> {
    const setting = await this.prisma.platformSetting.findUnique({ where: { key: 'EMERGENCY_STOP' } });
    return setting?.value === 'true';
  }

  // ─── Merchant Auth ───

  // NOTE: Direct merchant registration was removed.
  // Merchants are created ONLY via customer application + admin approval,
  // or manually by an admin.

  async merchantLogin(email: string, password: string, ip?: string) {
    // Emergency stop: pause ALL merchant accounts platform-wide
    if (await this.isEmergencyStopActive()) {
      throw new UnauthorizedException('Platform is temporarily paused for maintenance. Please try again later.');
    }

    const user = await this.prisma.merchantUser.findUnique({
      where: { email },
      include: { merchant: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.merchant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Merchant account suspended');
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.merchantUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditService.log({
      actorType: 'MERCHANT',
      actorId: user.id,
      action: 'merchant.login',
      entity: 'MerchantUser',
      entityId: user.id,
      ip,
    });

    const tokens = await this.generateMerchantTokens(user.id, user.email, user.merchantId);

    return {
      user: { id: user.id, email: user.email, name: user.name, merchantId: user.merchantId, merchantName: user.merchant.name },
      ...tokens,
    };
  }

  async merchantRefresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'merchant_refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const user = await this.prisma.merchantUser.findUnique({
        where: { id: payload.sub },
        include: { merchant: true },
      });
      if (!user || !user.isActive || user.merchant.status !== 'ACTIVE') {
        throw new UnauthorizedException('Account disabled');
      }
      return this.generateMerchantTokens(user.id, user.email, user.merchantId);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateMerchantTokens(userId: string, email: string, merchantId: string) {
    const payload = { sub: userId, email, merchantId, type: 'merchant' };
    const refreshPayload = { sub: userId, merchantId, type: 'merchant_refresh' };

    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    });
    const refresh_token = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return {
      access_token,
      refresh_token,
      expires_in: 900,
    };
  }

  // ─── API Key Management ───

  // ─── Customer Auth ───

  async customerRegister(data: { name: string; email: string; password: string }, ip?: string) {
    const existing = await this.prisma.customer.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(data.password);

    const customer = await this.prisma.customer.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        isActive: true,
      },
    });

    await this.auditService.log({
      actorType: 'CUSTOMER',
      actorId: customer.id,
      action: 'customer.register',
      entity: 'Customer',
      entityId: customer.id,
      ip,
    });

    const tokens = await this.generateCustomerTokens(customer.id, customer.email);

    return {
      user: { id: customer.id, email: customer.email, name: customer.name, role: 'customer' },
      ...tokens,
    };
  }

  async customerLogin(email: string, password: string, ip?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { email } });
    if (!customer || !customer.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(customer.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditService.log({
      actorType: 'CUSTOMER',
      actorId: customer.id,
      action: 'customer.login',
      entity: 'Customer',
      entityId: customer.id,
      ip,
    });

    const tokens = await this.generateCustomerTokens(customer.id, customer.email);

    return {
      user: { id: customer.id, email: customer.email, name: customer.name, role: 'customer', merchantId: customer.merchantId },
      ...tokens,
    };
  }

  async customerRefresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'customer_refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });
      if (!customer || !customer.isActive) {
        throw new UnauthorizedException('Account disabled');
      }
      return this.generateCustomerTokens(customer.id, customer.email);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateCustomerTokens(userId: string, email: string) {
    const payload = { sub: userId, email, type: 'customer' };
    const refreshPayload = { sub: userId, type: 'customer_refresh' };

    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    });
    const refresh_token = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return {
      access_token,
      refresh_token,
      expires_in: 900,
    };
  }

  async customerBecomeMerchant(customerId: string, data: {
    storeName: string; storeEmail: string; currency?: string;
    firstName: string; lastName: string; phone: string;
    idDocType: string; idFrontImage: string; idBackImage: string; businessNtn: string;
  }, ip?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new UnauthorizedException('Customer not found');
    }

    if (customer.merchantId) {
      throw new ConflictException('You are already a merchant');
    }

    if (customer.merchantAppStatus === 'PENDING') {
      throw new ConflictException('You already have a pending merchant application');
    }

    const existingMerchant = await this.prisma.merchant.findUnique({ where: { email: data.storeEmail } });
    if (existingMerchant) {
      throw new ConflictException('A merchant with this email already exists');
    }

    // Create application — admin must approve before merchant is created
    const application = await this.prisma.merchantApplication.create({
      data: {
        customerId,
        storeName: data.storeName,
        storeEmail: data.storeEmail,
        currency: data.currency || 'USD',
        // KYC details
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        idDocType: data.idDocType,
        idFrontImage: data.idFrontImage,
        idBackImage: data.idBackImage,
        businessNtn: data.businessNtn,
        status: 'PENDING',
      },
    });

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { merchantAppStatus: 'PENDING' },
    });

    await this.auditService.log({
      actorType: 'CUSTOMER',
      actorId: customerId,
      action: 'customer.merchant_application_submitted',
      entity: 'MerchantApplication',
      entityId: application.id,
      ip,
    });

    return {
      success: true,
      message: 'Merchant application submitted. An admin will review it.',
      applicationId: application.id,
      status: 'PENDING',
    };
  }

  async approveMerchantApplication(applicationId: string, adminId: string, ip?: string) {
    const application = await this.prisma.merchantApplication.findUnique({
      where: { id: applicationId },
      include: { customer: true },
    });

    if (!application) {
      throw new UnauthorizedException('Application not found');
    }

    if (application.status !== 'PENDING') {
      throw new ConflictException(`Application already ${application.status}`);
    }

    // Create merchant + link to customer in a single transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create merchant with a merchant user using the customer's password hash
      const merchant = await tx.merchant.create({
        data: {
          name: application.storeName,
          email: application.storeEmail,
          walletBalance: 0,
          currency: application.currency,
          status: 'ACTIVE',
          allowedProductIds: JSON.stringify([]),
          // Carry over the KYC details submitted with the application
          firstName: application.firstName,
          lastName: application.lastName,
          phone: application.phone,
          idDocType: application.idDocType,
          idFrontImage: application.idFrontImage,
          idBackImage: application.idBackImage,
          businessNtn: application.businessNtn,
          users: {
            create: {
              email: application.customer.email,
              name: application.customer.name,
              passwordHash: application.customer.passwordHash,
            },
          },
        },
        include: { users: true },
      });

      // Link customer to merchant
      await tx.customer.update({
        where: { id: application.customerId },
        data: {
          merchantId: merchant.id,
          merchantAppStatus: 'APPROVED',
        },
      });

      // Update application status
      await tx.merchantApplication.update({
        where: { id: applicationId },
        data: {
          status: 'APPROVED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });

      return { merchant, merchantUser: merchant.users[0] };
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.merchant_application_approved',
      entity: 'MerchantApplication',
      entityId: applicationId,
      ip,
    });

    return {
      success: true,
      message: 'Merchant application approved. Customer can now log in as a merchant.',
      merchantId: result.merchant.id,
      merchantName: result.merchant.name,
    };
  }

  async rejectMerchantApplication(applicationId: string, adminId: string, note: string, ip?: string) {
    const application = await this.prisma.merchantApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new UnauthorizedException('Application not found');
    }

    if (application.status !== 'PENDING') {
      throw new ConflictException(`Application already ${application.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.merchantApplication.update({
        where: { id: applicationId },
        data: {
          status: 'REJECTED',
          adminNote: note,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });

      await tx.customer.update({
        where: { id: application.customerId },
        data: { merchantAppStatus: 'REJECTED' },
      });
    });

    await this.auditService.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'admin.merchant_application_rejected',
      entity: 'MerchantApplication',
      entityId: applicationId,
      ip,
    });

    return {
      success: true,
      message: 'Merchant application rejected.',
    };
  }

  async listMerchantApplications(status?: string) {
    const where: any = {};
    if (status) where.status = status;

    return this.prisma.merchantApplication.findMany({
      where,
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── API Key Management ───

  async createApiKey(merchantId: string, scopes: string[] = ['fulfillment', 'read'], actorId?: string, ip?: string) {
    const keyId = `pk_${nanoid(24)}`;
    const secret = nanoid(48);
    const fullKey = `${keyId}.${secret}`;
    const keyPrefix = keyId.substring(0, 12);
    const keyHash = await argon2.hash(fullKey);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        merchantId,
        keyPrefix,
        keyHash,
        scopes: JSON.stringify(scopes),
        status: 'ACTIVE',
      },
    });

    await this.auditService.log({
      actorType: actorId ? 'ADMIN' : 'MERCHANT',
      actorId: actorId || merchantId,
      action: 'apikey.create',
      entity: 'ApiKey',
      entityId: apiKey.id,
      metadata: { merchantId, scopes },
      ip,
    });

    // Return the full key only once
    return { id: apiKey.id, key: fullKey, keyPrefix, scopes, createdAt: apiKey.createdAt };
  }

  async verifyApiKey(fullKey: string): Promise<{ apiKeyId: string; merchantId: string; scopes: string[]; ipWhitelist: string[] } | null> {
    const keyId = fullKey.split('.')[0];
    const prefix = keyId.substring(0, 12);

    const apiKeys = await this.prisma.apiKey.findMany({
      where: { keyPrefix: prefix, status: 'ACTIVE' },
    });

    for (const apiKey of apiKeys) {
      const valid = await argon2.verify(apiKey.keyHash, fullKey);
      if (valid) {
        await this.prisma.apiKey.update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() },
        });
        return {
          apiKeyId: apiKey.id,
          merchantId: apiKey.merchantId,
          scopes: JSON.parse(apiKey.scopes || '[]'),
          ipWhitelist: JSON.parse(apiKey.ipWhitelist || '[]'),
        };
      }
    }
    return null;
  }

  async revokeApiKey(merchantId: string, keyId: string, actorId?: string, actorType: 'ADMIN' | 'MERCHANT' = 'MERCHANT', ip?: string) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id: keyId, merchantId },
    });
    if (!apiKey) {
      throw new ConflictException('API key not found');
    }

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    await this.auditService.log({
      actorType,
      actorId: actorId || merchantId,
      action: 'apikey.revoke',
      entity: 'ApiKey',
      entityId: keyId,
      metadata: { merchantId },
      ip,
    });

    return { success: true };
  }

  // ─── HMAC Verification ───

  verifyHmacSignature(params: {
    secret: string;
    method: string;
    path: string;
    body: string;
    timestamp: string;
    signature: string;
  }): boolean {
    const { secret, method, path, body, timestamp, signature } = params;
    const data = `${method.toUpperCase()}\n${path}\n${body}\n${timestamp}`;
    const computed = this.encryptionService.hmacSha256(secret, data);
    return this.encryptionService.safeCompare(computed, signature);
  }

  verifyTimestamp(timestamp: string): boolean {
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return false;
    const now = Date.now();
    const skew = Math.abs(now - ts);
    const window = this.configService.get<number>('HMAC_TIMESTAMP_WINDOW_MS', 300000);
    return skew <= window;
  }

  // ─── Email Verification Code for Customer Login ───

  async requestCustomerVerificationCode(email: string): Promise<{ success: boolean; message: string }> {
    const customer = await this.prisma.customer.findUnique({ where: { email } });
    if (!customer || !customer.isActive) {
      // Don't reveal if customer exists for security
      return { success: true, message: 'If an account exists with this email, a verification code will be sent.' };
    }

    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store the code in the database
    await this.prisma.verificationCode.upsert({
      where: { customerId: customer.id },
      create: {
        customerId: customer.id,
        code: await argon2.hash(code),
        expiresAt,
      },
      update: {
        code: await argon2.hash(code),
        expiresAt,
        createdAt: new Date(),
      },
    });

    // Send the email
    const emailSent = await this.emailService.sendVerificationCodeEmail(email, customer.name, code);

    if (!emailSent) {
      this.logger.error(`Failed to send verification code email to ${email}`);
      return { success: false, message: 'Failed to send verification code. Please try again.' };
    }

    this.logger.log(`Verification code sent to ${email}`);
    return { success: true, message: 'Verification code sent to your email.' };
  }

  async verifyCustomerCodeAndLogin(email: string, code: string, ip?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { email } });
    if (!customer || !customer.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const verificationRecord = await this.prisma.verificationCode.findUnique({
      where: { customerId: customer.id },
    });

    if (!verificationRecord) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    // Check if code is expired
    if (new Date() > verificationRecord.expiresAt) {
      throw new UnauthorizedException('Verification code has expired. Please request a new one.');
    }

    // Verify the code
    const isValid = await argon2.verify(verificationRecord.code, code);
    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Delete the used verification code
    await this.prisma.verificationCode.delete({
      where: { customerId: customer.id },
    });

    // Update last login
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { lastLoginAt: new Date() },
    });

    // Log the login
    await this.auditService.log({
      actorType: 'CUSTOMER',
      actorId: customer.id,
      action: 'customer.login_with_code',
      entity: 'Customer',
      entityId: customer.id,
      ip,
    });

    // Generate tokens
    const tokens = await this.generateCustomerTokens(customer.id, customer.email);

    return {
      user: { id: customer.id, email: customer.email, name: customer.name, role: 'customer', merchantId: customer.merchantId },
      ...tokens,
    };
  }
}
