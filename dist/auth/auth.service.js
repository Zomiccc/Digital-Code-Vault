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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const argon2 = __importStar(require("argon2"));
const nanoid_1 = require("nanoid");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const encryption_service_1 = require("../encryption/encryption.service");
const email_service_1 = require("../email/email.service");
let AuthService = AuthService_1 = class AuthService {
    prisma;
    jwtService;
    configService;
    auditService;
    encryptionService;
    emailService;
    logger = new common_1.Logger(AuthService_1.name);
    constructor(prisma, jwtService, configService, auditService, encryptionService, emailService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.configService = configService;
        this.auditService = auditService;
        this.encryptionService = encryptionService;
        this.emailService = emailService;
    }
    async adminLogin(email, password, ip) {
        const admin = await this.prisma.adminUser.findUnique({ where: { email } });
        if (!admin || !admin.isActive) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const valid = await argon2.verify(admin.passwordHash, password);
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
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
    async adminRefresh(refreshToken) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
            });
            if (payload.type !== 'admin_refresh') {
                throw new common_1.UnauthorizedException('Invalid refresh token');
            }
            const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
            if (!admin || !admin.isActive) {
                throw new common_1.UnauthorizedException('Account disabled');
            }
            return this.generateAdminTokens(admin.id, admin.email, admin.role);
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
    }
    async generateAdminTokens(userId, email, role) {
        const payload = { sub: userId, email, role, type: 'admin' };
        const refreshPayload = { sub: userId, type: 'admin_refresh' };
        const access_token = await this.jwtService.signAsync(payload, {
            expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
        });
        const refresh_token = await this.jwtService.signAsync(refreshPayload, {
            secret: this.configService.get('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
        });
        return {
            access_token,
            refresh_token,
            expires_in: 900,
        };
    }
    async isEmergencyStopActive() {
        const setting = await this.prisma.platformSetting.findUnique({ where: { key: 'EMERGENCY_STOP' } });
        return setting?.value === 'true';
    }
    async merchantLogin(email, password, ip) {
        if (await this.isEmergencyStopActive()) {
            throw new common_1.UnauthorizedException('Platform is temporarily paused for maintenance. Please try again later.');
        }
        const user = await this.prisma.merchantUser.findUnique({
            where: { email },
            include: { merchant: true },
        });
        if (!user || !user.isActive) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (user.merchant.status !== 'ACTIVE') {
            throw new common_1.UnauthorizedException('Merchant account suspended');
        }
        const valid = await argon2.verify(user.passwordHash, password);
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
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
    async merchantRefresh(refreshToken) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
            });
            if (payload.type !== 'merchant_refresh') {
                throw new common_1.UnauthorizedException('Invalid refresh token');
            }
            const user = await this.prisma.merchantUser.findUnique({
                where: { id: payload.sub },
                include: { merchant: true },
            });
            if (!user || !user.isActive || user.merchant.status !== 'ACTIVE') {
                throw new common_1.UnauthorizedException('Account disabled');
            }
            return this.generateMerchantTokens(user.id, user.email, user.merchantId);
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
    }
    async generateMerchantTokens(userId, email, merchantId) {
        const payload = { sub: userId, email, merchantId, type: 'merchant' };
        const refreshPayload = { sub: userId, merchantId, type: 'merchant_refresh' };
        const access_token = await this.jwtService.signAsync(payload, {
            expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
        });
        const refresh_token = await this.jwtService.signAsync(refreshPayload, {
            secret: this.configService.get('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
        });
        return {
            access_token,
            refresh_token,
            expires_in: 900,
        };
    }
    async customerRegister(data, ip) {
        const existing = await this.prisma.customer.findUnique({ where: { email: data.email } });
        if (existing) {
            throw new common_1.ConflictException('An account with this email already exists');
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
    async customerLogin(email, password, ip) {
        const customer = await this.prisma.customer.findUnique({ where: { email } });
        if (!customer || !customer.isActive) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const valid = await argon2.verify(customer.passwordHash, password);
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
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
    async customerRefresh(refreshToken) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
            });
            if (payload.type !== 'customer_refresh') {
                throw new common_1.UnauthorizedException('Invalid refresh token');
            }
            const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });
            if (!customer || !customer.isActive) {
                throw new common_1.UnauthorizedException('Account disabled');
            }
            return this.generateCustomerTokens(customer.id, customer.email);
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
    }
    async generateCustomerTokens(userId, email) {
        const payload = { sub: userId, email, type: 'customer' };
        const refreshPayload = { sub: userId, type: 'customer_refresh' };
        const access_token = await this.jwtService.signAsync(payload, {
            expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
        });
        const refresh_token = await this.jwtService.signAsync(refreshPayload, {
            secret: this.configService.get('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
        });
        return {
            access_token,
            refresh_token,
            expires_in: 900,
        };
    }
    async customerBecomeMerchant(customerId, data, ip) {
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) {
            throw new common_1.UnauthorizedException('Customer not found');
        }
        if (customer.merchantId) {
            throw new common_1.ConflictException('You are already a merchant');
        }
        if (customer.merchantAppStatus === 'PENDING') {
            throw new common_1.ConflictException('You already have a pending merchant application');
        }
        const existingMerchant = await this.prisma.merchant.findUnique({ where: { email: data.storeEmail } });
        if (existingMerchant) {
            throw new common_1.ConflictException('A merchant with this email already exists');
        }
        const application = await this.prisma.merchantApplication.create({
            data: {
                customerId,
                storeName: data.storeName,
                storeEmail: data.storeEmail,
                currency: data.currency || 'USD',
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
    async approveMerchantApplication(applicationId, adminId, ip) {
        const application = await this.prisma.merchantApplication.findUnique({
            where: { id: applicationId },
            include: { customer: true },
        });
        if (!application) {
            throw new common_1.UnauthorizedException('Application not found');
        }
        if (application.status !== 'PENDING') {
            throw new common_1.ConflictException(`Application already ${application.status}`);
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const merchant = await tx.merchant.create({
                data: {
                    name: application.storeName,
                    email: application.storeEmail,
                    walletBalance: 0,
                    currency: application.currency,
                    status: 'ACTIVE',
                    allowedProductIds: JSON.stringify([]),
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
            await tx.customer.update({
                where: { id: application.customerId },
                data: {
                    merchantId: merchant.id,
                    merchantAppStatus: 'APPROVED',
                },
            });
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
    async rejectMerchantApplication(applicationId, adminId, note, ip) {
        const application = await this.prisma.merchantApplication.findUnique({
            where: { id: applicationId },
        });
        if (!application) {
            throw new common_1.UnauthorizedException('Application not found');
        }
        if (application.status !== 'PENDING') {
            throw new common_1.ConflictException(`Application already ${application.status}`);
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
    async listMerchantApplications(status) {
        const where = {};
        if (status)
            where.status = status;
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
    async createApiKey(merchantId, scopes = ['fulfillment', 'read'], actorId, ip) {
        const keyId = `pk_${(0, nanoid_1.nanoid)(24)}`;
        const secret = (0, nanoid_1.nanoid)(48);
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
        return { id: apiKey.id, key: fullKey, keyPrefix, scopes, createdAt: apiKey.createdAt };
    }
    async verifyApiKey(fullKey) {
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
    async revokeApiKey(merchantId, keyId, actorId, actorType = 'MERCHANT', ip) {
        const apiKey = await this.prisma.apiKey.findFirst({
            where: { id: keyId, merchantId },
        });
        if (!apiKey) {
            throw new common_1.ConflictException('API key not found');
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
    verifyHmacSignature(params) {
        const { secret, method, path, body, timestamp, signature } = params;
        const data = `${method.toUpperCase()}\n${path}\n${body}\n${timestamp}`;
        const computed = this.encryptionService.hmacSha256(secret, data);
        return this.encryptionService.safeCompare(computed, signature);
    }
    verifyTimestamp(timestamp) {
        const ts = parseInt(timestamp, 10);
        if (isNaN(ts))
            return false;
        const now = Date.now();
        const skew = Math.abs(now - ts);
        const window = this.configService.get('HMAC_TIMESTAMP_WINDOW_MS', 300000);
        return skew <= window;
    }
    async requestCustomerVerificationCode(email) {
        const customer = await this.prisma.customer.findUnique({ where: { email } });
        if (!customer || !customer.isActive) {
            return { success: true, message: 'If an account exists with this email, a verification code will be sent.' };
        }
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
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
        const emailSent = await this.emailService.sendVerificationCodeEmail(email, customer.name, code);
        if (!emailSent) {
            this.logger.error(`Failed to send verification code email to ${email}`);
            return { success: false, message: 'Failed to send verification code. Please try again.' };
        }
        this.logger.log(`Verification code sent to ${email}`);
        return { success: true, message: 'Verification code sent to your email.' };
    }
    async verifyCustomerCodeAndLogin(email, code, ip) {
        const customer = await this.prisma.customer.findUnique({ where: { email } });
        if (!customer || !customer.isActive) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const verificationRecord = await this.prisma.verificationCode.findUnique({
            where: { customerId: customer.id },
        });
        if (!verificationRecord) {
            throw new common_1.UnauthorizedException('Invalid or expired verification code');
        }
        if (new Date() > verificationRecord.expiresAt) {
            throw new common_1.UnauthorizedException('Verification code has expired. Please request a new one.');
        }
        const isValid = await argon2.verify(verificationRecord.code, code);
        if (!isValid) {
            throw new common_1.UnauthorizedException('Invalid verification code');
        }
        await this.prisma.verificationCode.delete({
            where: { customerId: customer.id },
        });
        await this.prisma.customer.update({
            where: { id: customer.id },
            data: { lastLoginAt: new Date() },
        });
        await this.auditService.log({
            actorType: 'CUSTOMER',
            actorId: customer.id,
            action: 'customer.login_with_code',
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
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService,
        audit_service_1.AuditService,
        encryption_service_1.EncryptionService,
        email_service_1.EmailService])
], AuthService);
//# sourceMappingURL=auth.service.js.map