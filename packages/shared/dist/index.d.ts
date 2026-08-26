/**
 * Builds a Google Maps search URL for a given address.
 * The address is URL-encoded automatically.
 * Opens in a new tab when used with target="_blank" rel="noopener noreferrer".
 */
export declare function buildGoogleMapsUrl(address: string): string;
export type CodeStatus = 'AVAILABLE' | 'RESERVED' | 'ALLOCATED' | 'DELIVERED' | 'VOID' | 'EXPIRED';
export type FulfillmentStatus = 'PENDING' | 'ALLOCATED' | 'DELIVERED' | 'FAILED' | 'REVERSED';
export type WalletTxType = 'DEBIT' | 'CREDIT' | 'REFUND';
export type AdminRole = 'SUPER_ADMIN' | 'INVENTORY_MANAGER' | 'SUPPORT' | 'FINANCE';
export type MerchantStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
export type ApiKeyStatus = 'ACTIVE' | 'REVOKED';
export type ActorType = 'ADMIN' | 'MERCHANT' | 'SYSTEM' | 'CUSTOMER';
export interface CreateFulfillmentDto {
    product_id: string;
    amount: number;
    currency: string;
    reference_id?: string;
}
export interface FulfillmentResponseDto {
    fulfillment_id: string;
    status: FulfillmentStatus;
    allocation: string[];
    delivery_link?: string;
    wallet_balance_after: number;
}
export interface ProductDto {
    id: string;
    name: string;
    region: string;
    status: string;
}
export interface DenominationDto {
    id: string;
    face_value: number;
    currency: string;
    available_stock: number;
}
export interface WalletDto {
    balance: number;
    currency: string;
}
export interface WalletTransactionDto {
    id: string;
    type: WalletTxType;
    amount: number;
    reference_id: string | null;
    created_at: string;
}
export type WebhookEvent = 'fulfillment.allocated' | 'fulfillment.failed' | 'delivery.revealed' | 'fulfillment.reversed';
export interface WebhookPayload {
    event: WebhookEvent;
    fulfillment_id: string;
    reference_id?: string;
    timestamp: number;
    data: Record<string, unknown>;
}
export interface ApiError {
    error: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
}
export interface AdminUserDto {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
}
export interface MerchantUserDto {
    id: string;
    email: string;
    name: string;
    merchant_id: string;
    merchant_name: string;
}
export interface AuthTokens {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}
