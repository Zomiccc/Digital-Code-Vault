import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../encryption/encryption.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    private encryptionService: EncryptionService,
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

  // ─── Merchant Auth ───

  async merchantLogin(email: string, password: string, ip?: string) {
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

  async verifyApiKey(fullKey: string): Promise<{ apiKeyId: string; merchantId: string; scopes: string[] } | null> {
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
        return { apiKeyId: apiKey.id, merchantId: apiKey.merchantId, scopes: JSON.parse(apiKey.scopes || '[]') };
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
}
