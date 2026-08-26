import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export declare class EmailService {
    private configService;
    private prisma;
    private readonly logger;
    private readonly apiKey;
    private readonly fromEmail;
    private readonly fromName;
    private readonly provider;
    private smtpTransport;
    constructor(configService: ConfigService, prisma: PrismaService);
    sendEmail(to: string, subject: string, html: string, options?: {
        text?: string;
        attachments?: Array<{
            filename: string;
            content: Buffer | string;
            contentType?: string;
        }>;
        merchantId?: string;
        template?: string;
    }): Promise<boolean>;
    private sendViaResend;
    private sendViaSendGrid;
    generateInvoice(params: {
        invoiceNumber: string;
        customerName: string;
        customerEmail: string;
        merchantName: string;
        merchantAddress?: string;
        product: string;
        quantity: number;
        price: number;
        subtotal: number;
        tax: number;
        total: number;
        paymentMethod: string;
        date: string;
        billingAddress?: string;
    }): Promise<Buffer>;
    sendCodeEmail(to: string, merchantName: string, productName: string, codes: {
        denomination: string;
        code: string;
    }[], fulfillmentId: string): Promise<boolean>;
    sendRevealCodeEmail(to: string, customerName: string, productName: string, revealLink: string, fulfillmentId: string): Promise<boolean>;
    sendOrderReceivedEmail(to: string, customerName: string, orderId: string, orderDate: string, product: string, totalPayment: string, paymentMethods: string[], bankDetails: Array<{
        bank: string;
        accountNumber: string;
        iban: string;
    }>, easyPaisa?: {
        title: string;
        number: string;
    }): Promise<boolean>;
    sendPaymentConfirmationEmail(to: string, customerName: string, orderId: string, orderDate: string, product: string, quantity: number, price: number, subtotal: number, tax: number, total: number, paymentMethod: string, billingAddress?: string, invoiceBuffer?: Buffer, revealLink?: string): Promise<boolean>;
    sendMerchantPurchaseNotification(to: string, merchantName: string, customerName: string, customerEmail: string, productName: string, orderId: string, purchaseDate: string, orderStatus: string, productRegion?: string): Promise<boolean>;
    sendDeliveryLinkEmail(to: string, merchantName: string, productName: string, deliveryLink: string, fulfillmentId: string, expiryMinutes?: number): Promise<boolean>;
    sendVerificationCodeEmail(to: string, customerName: string, code: string): Promise<boolean>;
    sendDeliveryReadyEmail(to: string, customerName: string, orderId: string, productName: string, amount: string, deliveryLink: string): Promise<boolean>;
}
