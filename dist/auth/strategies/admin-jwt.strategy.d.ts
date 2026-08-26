import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
export interface AdminJwtPayload {
    sub: string;
    email: string;
    role: string;
    type: string;
}
declare const AdminJwtStrategy_base: new (...args: any[]) => Strategy;
export declare class AdminJwtStrategy extends AdminJwtStrategy_base {
    private configService;
    private prisma;
    constructor(configService: ConfigService, prisma: PrismaService);
    validate(payload: AdminJwtPayload): Promise<{
        id: string;
        email: string;
        name: string;
        role: string;
    } | null>;
}
export {};
