export declare class CreateFulfillmentDto {
    product_id: string;
    amount: number;
    currency?: string;
    reference_id?: string;
    customer_email?: string;
    customer_name?: string;
    customer_address?: string;
    inventory_source?: string;
    variant_id?: string;
}
export declare class CreateMerchantDto {
    name: string;
    email: string;
    password: string;
    address?: string;
    currency?: string;
    allowed_product_ids?: string[];
    initial_wallet_balance?: number;
}
export declare class UpdateMerchantStatusDto {
    status: string;
}
export declare class CreditWalletDto {
    amount: number;
}
export declare class CreateProductDto {
    name: string;
    region: string;
    supplier_id?: string;
    product_type?: string;
    category_id?: string;
}
export declare class CreateDenominationDto {
    face_value: number;
    currency?: string;
}
export declare class CreateSupplierDto {
    name: string;
    contact_info?: string;
}
export declare class BulkUploadCodesDto {
    denomination_id: string;
    codes: string[];
    supplier_id?: string;
    cost_per_code?: number;
    currency?: string;
    note?: string;
}
export declare class CreateAdminUserDto {
    email: string;
    name: string;
    password: string;
    role: string;
}
export declare class CreateApiKeyDto {
    scopes?: string[];
}
export declare class CreateWebhookDto {
    url: string;
    skipVerification?: boolean;
}
export declare class CreateFundingRequestDto {
    amount: number;
    note?: string;
    screenshot: string;
}
export declare class CreateSupportMessageDto {
    body?: string;
    image?: string;
    fundingRequestId?: string;
}
export declare class FundingRequestActionDto {
    note?: string;
}
export declare class CreateCategoryDto {
    name: string;
    slug?: string;
    description?: string;
    image?: string;
    sortOrder?: number;
}
export declare class UpdateCategoryDto {
    name?: string;
    slug?: string;
    description?: string;
    image?: string;
    sortOrder?: number;
    active?: boolean;
}
export declare class CreateRegionDto {
    name: string;
    code: string;
    currency?: string;
    symbol?: string;
}
export declare class UpdateRegionDto {
    name?: string;
    code?: string;
    currency?: string;
    symbol?: string;
    active?: boolean;
}
export declare class CreateProductRegionDto {
    productId: string;
    regionId: string;
}
export declare class CreateVariantDto {
    productRegionId: string;
    name: string;
    slug?: string;
    description?: string;
    customerPrice: number;
    currency?: string;
    sortOrder?: number;
}
export declare class UpdateVariantDto {
    name?: string;
    slug?: string;
    description?: string;
    customerPrice?: number;
    currency?: string;
    sortOrder?: number;
    active?: boolean;
}
export declare class CreateCombinationDto {
    variantId: string;
    name: string;
    priority?: number;
    active?: boolean;
    items: {
        denominationId: string;
        quantity: number;
    }[];
}
export declare class UpdateCombinationDto {
    name?: string;
    priority?: number;
    active?: boolean;
    items?: {
        denominationId: string;
        quantity: number;
    }[];
}
