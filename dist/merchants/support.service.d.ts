import { PrismaService } from '../prisma/prisma.service';
export declare class SupportService {
    private prisma;
    constructor(prisma: PrismaService);
    getMerchantThread(merchantId: string): Promise<{
        id: string;
        createdAt: Date;
        merchantId: string;
        body: string | null;
        senderRole: string;
        senderName: string | null;
        image: string | null;
        fundingRequestId: string | null;
        readByAdmin: boolean;
        readByMerchant: boolean;
    }[]>;
    sendMerchantMessage(merchantId: string, senderName: string, body?: string, image?: string, fundingRequestId?: string): Promise<{
        id: string;
        createdAt: Date;
        merchantId: string;
        body: string | null;
        senderRole: string;
        senderName: string | null;
        image: string | null;
        fundingRequestId: string | null;
        readByAdmin: boolean;
        readByMerchant: boolean;
    }>;
    adminListThreads(): Promise<{
        merchantId: string;
        merchantName: string;
        merchantEmail: string;
        merchantStatus: string;
        lastMessage: {
            body: string | null;
            hasImage: boolean;
            senderRole: string;
            createdAt: Date;
        } | null;
        unreadCount: number;
    }[]>;
    adminGetThread(merchantId: string): Promise<{
        merchant: {
            id: string;
            name: string;
            email: string;
            walletBalance: import("@prisma/client/runtime/library").Decimal;
            currency: string;
        };
        messages: {
            id: string;
            createdAt: Date;
            merchantId: string;
            body: string | null;
            senderRole: string;
            senderName: string | null;
            image: string | null;
            fundingRequestId: string | null;
            readByAdmin: boolean;
            readByMerchant: boolean;
        }[];
    }>;
    adminSendMessage(merchantId: string, senderName: string, body?: string): Promise<{
        id: string;
        createdAt: Date;
        merchantId: string;
        body: string | null;
        senderRole: string;
        senderName: string | null;
        image: string | null;
        fundingRequestId: string | null;
        readByAdmin: boolean;
        readByMerchant: boolean;
    }>;
}
