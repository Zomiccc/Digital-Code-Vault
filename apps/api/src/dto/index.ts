import { IsString, IsNumber, IsOptional, IsNotEmpty, IsArray, Min, IsIn, MinLength } from 'class-validator';

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
}

export class FundingRequestActionDto {
  @IsOptional()
  @IsString()
  note?: string;
}
