"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let SupportService = class SupportService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getMerchantThread(merchantId) {
        const messages = await this.prisma.supportMessage.findMany({
            where: { merchantId },
            orderBy: { createdAt: 'asc' },
            take: 200,
        });
        await this.prisma.supportMessage.updateMany({
            where: { merchantId, senderRole: 'ADMIN', readByMerchant: false },
            data: { readByMerchant: true },
        });
        return messages;
    }
    async sendMerchantMessage(merchantId, senderName, body, image, fundingRequestId) {
        if (!body && !image)
            throw new common_1.BadRequestException('Message text or an image is required');
        const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant)
            throw new common_1.NotFoundException('Merchant not found');
        return this.prisma.supportMessage.create({
            data: {
                merchantId,
                senderRole: 'MERCHANT',
                senderName,
                body,
                image,
                fundingRequestId,
            },
        });
    }
    async adminListThreads() {
        const merchants = await this.prisma.merchant.findMany({
            where: {
                OR: [
                    { supportMessages: { some: {} } },
                ],
            },
            select: { id: true, name: true, email: true, status: true },
        });
        const threads = await Promise.all(merchants.map(async (m) => {
            const [last, unread] = await Promise.all([
                this.prisma.supportMessage.findFirst({
                    where: { merchantId: m.id },
                    orderBy: { createdAt: 'desc' },
                }),
                this.prisma.supportMessage.count({
                    where: { merchantId: m.id, senderRole: 'MERCHANT', readByAdmin: false },
                }),
            ]);
            return {
                merchantId: m.id,
                merchantName: m.name,
                merchantEmail: m.email,
                merchantStatus: m.status,
                lastMessage: last
                    ? { body: last.body?.slice(0, 120) || null, hasImage: !!last.image, senderRole: last.senderRole, createdAt: last.createdAt }
                    : null,
                unreadCount: unread,
            };
        }));
        threads.sort((a, b) => {
            const ta = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
            const tb = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
            return tb - ta;
        });
        return threads;
    }
    async adminGetThread(merchantId) {
        const merchant = await this.prisma.merchant.findUnique({
            where: { id: merchantId },
            select: { id: true, name: true, email: true, walletBalance: true, currency: true },
        });
        if (!merchant)
            throw new common_1.NotFoundException('Merchant not found');
        const messages = await this.prisma.supportMessage.findMany({
            where: { merchantId },
            orderBy: { createdAt: 'asc' },
            take: 200,
        });
        await this.prisma.supportMessage.updateMany({
            where: { merchantId, senderRole: 'MERCHANT', readByAdmin: false },
            data: { readByAdmin: true },
        });
        return { merchant, messages };
    }
    async adminSendMessage(merchantId, senderName, body) {
        if (!body)
            throw new common_1.BadRequestException('Message text is required');
        const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
        if (!merchant)
            throw new common_1.NotFoundException('Merchant not found');
        return this.prisma.supportMessage.create({
            data: { merchantId, senderRole: 'ADMIN', senderName, body },
        });
    }
};
exports.SupportService = SupportService;
exports.SupportService = SupportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SupportService);
//# sourceMappingURL=support.service.js.map