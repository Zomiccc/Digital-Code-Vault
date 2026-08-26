export interface DetectedProvider {
    provider: string;
    platform: string;
    confidence: number;
}
export interface NormalizedWebhookPayload {
    provider: string;
    platform: string;
    eventId: string | null;
    orderId: string | null;
    productId: string | null;
    productName: string | null;
    productSku: string | null;
    productCategory: string | null;
    customerName: string | null;
    customerEmail: string | null;
    quantity: number | null;
    amount: number | null;
    currency: string | null;
    paymentStatus: string | null;
    orderStatus: string | null;
    imageUrl: string | null;
}
export declare class ProviderDetector {
    static detect(headers: Record<string, any>, payload: any): DetectedProvider;
    static normalize(headers: Record<string, any>, payload: any): NormalizedWebhookPayload;
}
