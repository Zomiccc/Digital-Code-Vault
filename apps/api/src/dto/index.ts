import { IsString, IsNumber, IsOptional, IsNotEmpty, IsArray, Min, IsIn, MinLength, IsBoolean, IsInt } from 'class-validator';

export class CreateFulfillmentDto {
  @IsString()
  @IsNotEmpty()
  product_id!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  reference_id?: string;

  @IsOptional()
  @IsString()
  customer_email?: string;

  @IsOptional()
  @IsString()
  customer_name?: string;

  @IsOptional()
  @IsString()
  customer_address?: string;

  @IsOptional()
  @IsString()
  inventory_source?: string; // 'DCV' | 'MERCHANT' | 'AUTO'

  @IsOptional()
  @IsString()
  variant_id?: string; // target a specific variant — uses its admin-preset code bundle
}

export class CreateMerchantDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_product_ids?: string[];

  @IsOptional()
  @IsNumber()
  initial_wallet_balance?: number;
}

export class UpdateMerchantStatusDto {
  @IsString()
  @IsIn(['ACTIVE', 'SUSPENDED', 'DISABLED'])
  status!: string;
}

export class CreditWalletDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  region!: string;

  @IsOptional()
  @IsString()
  supplier_id?: string;

  @IsOptional()
  @IsIn(['NORMAL', 'ESSENTIALS'])
  product_type?: string;

  @IsOptional()
  @IsString()
  category_id?: string;
}

export class CreateDenominationDto {
  @IsNumber()
  @Min(0.01)
  face_value!: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  contact_info?: string;
}

export class BulkUploadCodesDto {
  @IsString()
  @IsNotEmpty()
  denomination_id!: string;

  @IsArray()
  @IsString({ each: true })
  codes!: string[];

  @IsOptional()
  @IsString()
  supplier_id?: string;
}

export class CreateAdminUserDto {
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @Min(8)
  password!: string;

  @IsString()
  @IsIn(['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER', 'FINANCE', 'SUPPORT'])
  role!: string;
}

export class CreateApiKeyDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}

export class CreateWebhookDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsOptional()
  skipVerification?: boolean;
}

export class CreateFundingRequestDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsString()
  @MinLength(10)
  screenshot!: string; // base64 data-URL of the payment proof
}

export class CreateSupportMessageDto {
  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  image?: string; // base64 data-URL attachment

  @IsOptional()
  @IsString()
  fundingRequestId?: string;
}

export class FundingRequestActionDto {
  @IsOptional()
  @IsString()
  note?: string;
}

// ─── Catalog DTOs ───

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateRegionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  symbol?: string;
}

export class UpdateRegionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateProductRegionDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  regionId!: string;
}

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  productRegionId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  customerPrice!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customerPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateCombinationDto {
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsArray()
  items!: { denominationId: string; quantity: number }[];
}

export class UpdateCombinationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  items?: { denominationId: string; quantity: number }[];
}
