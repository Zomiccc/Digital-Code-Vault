import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../encryption/encryption.service';
import { EmailService } from '../email/email.service';
export declare class AuthService {
    private prisma;
    private jwtService;
    private configService;
    private auditService;
    private encryptionService;
    private emailService;
    private readonly logger;
    constructor(prisma: PrismaService, jwtService: JwtService, configService: ConfigService, auditService: AuditService, encryptionService: EncryptionService, emailService: EmailService);
    adminLogin(email: string, password: string, ip?: string): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
        };
    }>;
    adminRefresh(refreshToken: string): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
    }>;
    private generateAdminTokens;
    isEmergencyStopActive(): Promise<boolean>;
    merchantLogin(email: string, password: string, ip?: string): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
            name: string;
            merchantId: string;
            merchantName: string;
        };
    }>;
    merchantRefresh(refreshToken: string): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
    }>;
    private generateMerchantTokens;
    customerRegister(data: {
        name: string;
        email: string;
        password: string;
    }, ip?: string): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
        };
    }>;
    customerLogin(email: string, password: string, ip?: string): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
            merchantId: string | null;
        };
    }>;
    customerRefresh(refreshToken: string): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
    }>;
    private generateCustomerTokens;
    customerBecomeMerchant(customerId: string, data: {
        storeName: string;
        storeEmail: string;
        currency?: string;
        firstName: string;
        lastName: string;
        phone: string;
        idDocType: string;
        idFrontImage: string;
        idBackImage: string;
        businessNtn: string;
    }, ip?: string): Promise<{
        success: boolean;
        message: string;
        applicationId: string;
        status: string;
    }>;
    approveMerchantApplication(applicationId: string, adminId: string, ip?: string): Promise<{
        success: boolean;
        message: string;
        merchantId: string;
        merchantName: string;
    }>;
    rejectMerchantApplication(applicationId: string, adminId: string, note: string, ip?: string): Promise<{
        success: boolean;
        message: string;
    }>;
    listMerchantApplications(status?: string): Promise<({
        customer: {
            id: string;
            name: string;
            email: string;
        };
    } & {
        id: string;
        createdAt: Date;
        status: string;
        updatedAt: Date;
        currency: string;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
        idDocType: string | null;
        idFrontImage: string | null;
        idBackImage: string | null;
        businessNtn: string | null;
        storeName: string;
        storeEmail: string;
        adminNote: string | null;
        reviewedBy: string | null;
        reviewedAt: Date | null;
        customerId: string;
    })[]>;
    createApiKey(merchantId: string, scopes?: string[], actorId?: string, ip?: string): Promise<{
        id: string;
        key: string;
        keyPrefix: string;
        scopes: string[];
        createdAt: Date;
    }>;
    verifyApiKey(fullKey: string): Promise<{
        apiKeyId: string;
        merchantId: string;
        scopes: string[];
        ipWhitelist: string[];
    } | null>;
    revokeApiKey(merchantId: string, keyId: string, actorId?: string, actorType?: 'ADMIN' | 'MERCHANT', ip?: string): Promise<{
        success: boolean;
    }>;
    verifyHmacSignature(params: {
        secret: string;
        method: string;
        path: string;
        body: string;
        timestamp: string;
        signature: string;
    }): boolean;
    verifyTimestamp(timestamp: string): boolean;
    requestCustomerVerificationCode(email: string): Promise<{
        success: boolean;
        message: string;
    }>;
    verifyCustomerCodeAndLogin(email: string, code: string, ip?: string): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
            merchantId: string | null;
        };
    }>;
}
