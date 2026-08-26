import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
export interface MerchantJwtPayload {
    sub: string;
    email: string;
    merchantId: string;
    type: string;
}
declare const MerchantJwtStrategy_base: new (...args: any[]) => Strategy;
export declare class MerchantJwtStrategy extends MerchantJwtStrategy_base {
    private configService;
    private prisma;
    constructor(configService: ConfigService, prisma: PrismaService);
    validate(payload: MerchantJwtPayload): Promise<{
        id: string;
        email: string;
        name: string;
        merchantId: string;
        merchant: {
            id: string;
            createdAt: Date;
            name: string;
            status: string;
            email: string;
            updatedAt: Date;
            address: string | null;
            walletBalance: import("@prisma/client/runtime/library").Decimal;
            currency: string;
            allowedProductIds: string;
            twoFactorRequired: boolean;
            totalKeysGenerated: number;
            lastKeyGeneratedAt: Date | null;
            webhookSecret: string | null;
            firstName: string | null;
            lastName: string | null;
            phone: string | null;
            idDocType: string | null;
            idFrontImage: string | null;
            idBackImage: string | null;
            businessNtn: string | null;
        };
    } | null>;
}
export {};
