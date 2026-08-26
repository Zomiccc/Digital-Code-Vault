import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
export interface CustomerJwtPayload {
    sub: string;
    email: string;
    type: string;
}
declare const CustomerJwtStrategy_base: new (...args: any[]) => Strategy;
export declare class CustomerJwtStrategy extends CustomerJwtStrategy_base {
    private configService;
    private prisma;
    constructor(configService: ConfigService, prisma: PrismaService);
    validate(payload: CustomerJwtPayload): Promise<{
        id: string;
        email: string;
        name: string;
        merchantId: string | null;
    } | null>;
}
export {};
