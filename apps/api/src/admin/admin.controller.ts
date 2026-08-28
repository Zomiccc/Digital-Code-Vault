import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req,
  UseGuards, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { MerchantsService } from '../merchants/merchants.service';
import { ProductsService } from '../products/products.service';
import { CodesService } from '../codes/codes.service';
import { EssentialsService } from '../essentials/essentials.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { DeliveryService } from '../delivery/delivery.service';
import { SupportService } from '../merchants/support.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import {
  CreateMerchantDto, UpdateMerchantStatusDto, CreditWalletDto,
  CreateProductDto, CreateDenominationDto, CreateSupplierDto,
  BulkUploadCodesDto, CreateAdminUserDto,
  FundingRequestActionDto,
} from '../dto';

// ─── Exact product-name → SKU-prefix mapping (user-defined) ───
// Keys are matched case-insensitively against the full product name.
// If a product name doesn't match any entry, a fallback is generated.
const PRODUCT_SKU_MAP: Record<string, string> = {
  'psn ksa digital code': 'PSN-KSA',
  'psn ca digital code': 'PSN-CA',
  'psn au digital code': 'PSN-GLO',
  'psn hk digital code': 'PSN-GLO-1',
  'psn qa digital code': 'PSN-GLO-2',
  'psn in digital code': 'PSN-GLO-3',
  'xbox usa gift card': 'XBOX-USA',
  'xbox game pass subscriptions': 'XBOX-USA-1',
  'itunes usa gift card': 'ITUNES-USA',
  'nintendo eshop usa': 'NINTENDO-USA',
  'nintendo switch online membership': 'NINTENDO-USA-1',
  'steam usa wallet code': 'STEAM-USA',
  'google play usa gift card': 'GOOGLE-USA',
  'pubg uc — pakistan region': 'PUBG-PK',
  'pubg uc — other regions': 'PUBG-GLO',
  'pubg uc - pakistan region': 'PUBG-PK',
  'pubg uc - other regions': 'PUBG-GLO',
  'nord vpn subscription': 'NVS-GLO',
  'ms office pro plus keys': 'MOPP-GLO',
  'windows 11 pro key': 'WPK-GLO',
  'razer gold usa': 'RGU-USA',
  'roblox robux': 'ROBLOX-USA',
  'fortnite v-bucks usa': 'FORNITE-USA',
};

// Fuzzy keyword-based fallback mapping for products not in the exact map
const KEYWORD_SKU_MAP: { keywords: string[]; prefix: string }[] = [
  { keywords: ['playstation', 'psn'], prefix: 'PSN' },
  { keywords: ['itunes', 'apple'], prefix: 'ITUNES' },
  { keywords: ['google play'], prefix: 'GOOGLE' },
  { keywords: ['steam'], prefix: 'STEAM' },
  { keywords: ['xbox'], prefix: 'XBOX' },
  { keywords: ['nintendo', 'eshop'], prefix: 'NINTENDO' },
  { keywords: ['roblox'], prefix: 'ROBLOX' },
  { keywords: ['fortnite', 'v-bucks', 'vbucks'], prefix: 'FORNITE' },
  { keywords: ['pubg'], prefix: 'PUBG' },
  { keywords: ['netflix'], prefix: 'NETFLIX' },
  { keywords: ['spotify'], prefix: 'SPOTIFY' },
  { keywords: ['amazon'], prefix: 'AMAZON' },
  { keywords: ['razer'], prefix: 'RAZER' },
  { keywords: ['nord vpn', 'nordvpn'], prefix: 'NVS' },
  { keywords: ['office', 'msoffice'], prefix: 'MOPP' },
  { keywords: ['windows'], prefix: 'WPK' },
];

function resolveProductSkuBase(name: string, region: string): string {
  const lower = name.toLowerCase().trim();

  // 1. Exact match against the user-defined map
  if (PRODUCT_SKU_MAP[lower]) {
    return PRODUCT_SKU_MAP[lower];
  }

  // 2. Keyword-based fallback
  for (const entry of KEYWORD_SKU_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      const regionCode = (region || 'GLO').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'GLO';
      return `${entry.prefix}-${regionCode}`;
    }
  }

  // 3. Generic fallback: first letters of each word + region
  const words = name.toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/).filter(Boolean);
  const regionCode = (region || 'GLO').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'GLO';
  if (words.length === 1) {
    return `${words[0].slice(0, 4)}-${regionCode}`;
  }
  return `${words.map((w) => w[0]).join('').slice(0, 4)}-${regionCode}`;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private merchantsService: MerchantsService,
    private productsService: ProductsService,
    private codesService: CodesService,
    private essentialsService: EssentialsService,
    private authService: AuthService,
    private prisma: PrismaService,
    private walletService: WalletService,
    private deliveryService: DeliveryService,
    private supportService: SupportService,
    private fulfillmentService: FulfillmentService,
  ) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getDashboardStats();
  }

  // ─── Merchants ───

  @Get('merchants')
  async listMerchants() {
    return this.merchantsService.listMerchants();
  }

  @Post('merchants')
  @Roles('SUPER_ADMIN')
  async createMerchant(@Body() body: CreateMerchantDto, @CurrentUser() user: any, @Req() req: any) {
    return this.merchantsService.createMerchant(body);
  }

  @Patch('merchants/:id/status')
  @Roles('SUPER_ADMIN')
  async updateMerchantStatus(@Param('id') id: string, @Body() body: UpdateMerchantStatusDto) {
    return this.merchantsService.updateMerchantStatus(id, body.status as any);
  }

  @Post('merchants/:id/wallet/credit')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async creditWallet(@Param('id') id: string, @Body() body: CreditWalletDto, @CurrentUser() user: any, @Req() req: any) {
    return this.merchantsService.addWalletCredit(id, body.amount, user.id, req.ip);
  }

  @Patch('merchants/:id/currency')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async updateMerchantCurrency(@Param('id') id: string, @Body() body: { currency: string }) {
    return this.merchantsService.updateMerchantCurrency(id, body.currency);
  }

  // ─── Admin Wallet / Finance ───

  @Get('wallet')
  async getAdminWallet() {
    return this.walletService.getAdminWallet();
  }

  @Get('finance/overview')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async getPlatformFinanceOverview() {
    return this.walletService.getPlatformFinanceOverview();
  }

  @Patch('finance/exchange-rate')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async updateExchangeRate(@Body() body: { rate: number }, @CurrentUser() user: any) {
    return this.walletService.updateExchangeRate(body.rate, user.id);
  }

  @Get('finance/cost-basis')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async getCostBasis() {
    return this.walletService.getCostBasisByCurrency();
  }

  @Get('wallet/transactions')
  async getAdminWalletTransactions(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.walletService.getAdminWalletTransactions(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Get('wallet/funding-requests')
  async listFundingRequests(@Query('status') status?: string) {
    return this.walletService.listFundingRequests(undefined, status);
  }

  @Post('wallet/funding-requests/:id/approve')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async approveFundingRequest(
    @Param('id') id: string,
    @Body() body: FundingRequestActionDto,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    return this.walletService.approveFundingRequest(id, user.id, body.note, req.ip, body.editedAmount);
  }

  @Post('wallet/funding-requests/:id/reject')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async rejectFundingRequest(
    @Param('id') id: string,
    @Body() body: FundingRequestActionDto,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    return this.walletService.rejectFundingRequest(id, user.id, body.note, req.ip);
  }

  @Get('wallet/reconciliation')
  async getReconciliationReport(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.walletService.getReconciliationReport(
      limit ? parseInt(limit) : 100,
      offset ? parseInt(offset) : 0,
    );
  }

  @Get('merchants/:id/finance')
  async getMerchantFinance(@Param('id') id: string) {
    return this.walletService.getMerchantFinanceDetail(id);
  }

  // ─── Products & Denominations ───

  @Get('products')
  async listProducts() {
    return this.productsService.listAllProducts();
  }

  @Post('products')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createProduct(@Body() body: CreateProductDto) {
    return this.productsService.createProduct({
      name: body.name,
      region: body.region,
      supplierId: body.supplier_id,
      categoryId: body.category_id,
      productType: body.product_type,
      sku: body.sku,
    });
  }

  @Patch('products/:id/sku')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async updateProductSku(@Param('id') id: string, @Body() body: { sku?: string | null }) {
    return this.productsService.updateProductSku(id, body.sku || null);
  }

  @Patch('products/:id/type')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async updateProductType(@Param('id') id: string, @Body() body: { product_type: string }) {
    return this.productsService.updateProductType(id, body.product_type);
  }

  @Patch('products/:id/category')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async updateProductCategory(@Param('id') id: string, @Body() body: { category_id: string | null }) {
    return this.productsService.updateProductCategory(id, body.category_id || null);
  }

  @Post('products/:id/denominations')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createDenomination(@Param('id') id: string, @Body() body: CreateDenominationDto) {
    return this.productsService.createDenomination(id, body.face_value, body.currency);
  }

  // ─── Essentials Delivery Config (reusable denomination + quantity rules) ───

  @Get('products/:id/essentials/delivery-config')
  async getEssentialsDeliveryConfig(@Param('id') id: string) {
    return this.essentialsService.getDeliveryConfig(id);
  }

  @Post('products/:id/essentials/delivery-config')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async saveEssentialsDeliveryConfig(
    @Param('id') id: string,
    @Body() body: { items: { denominationId: string; quantity: number }[] },
    @CurrentUser() user: any,
  ) {
    return this.essentialsService.saveDeliveryConfig(id, body.items || [], user?.id);
  }

  @Get('products/:id/essentials/availability')
  async getEssentialsAvailability(@Param('id') id: string) {
    return this.essentialsService.getAvailability(id);
  }

  // ─── Suppliers ───

  @Get('suppliers')
  async listSuppliers() {
    return this.adminService.listSuppliers();
  }

  @Post('suppliers')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createSupplier(@Body() body: CreateSupplierDto) {
    return this.adminService.createSupplier(body);
  }

  // ─── Codes ───

  @Get('codes')
  async listCodes(
    @Query('denominationId') denominationId?: string,
    @Query('status') status?: string,
    @Query('batchId') batchId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.codesService.listCodes({
      denominationId,
      status,
      batchId,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
  }

  @Post('codes/bulk-upload')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async bulkUploadCodes(
    @Body() body: BulkUploadCodesDto,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    return this.codesService.bulkUpload(
      body.denomination_id,
      body.codes,
      user.id,
      body.supplier_id,
      req.ip,
      { costPerCode: body.cost_per_code, currency: body.currency, note: body.note },
    );
  }

  // ─── Manual order creation (admin) ───

  @Post('orders/create')
  @Roles('SUPER_ADMIN', 'SUPPORT', 'FINANCE')
  async createManualOrder(@Body() body: {
    merchantId?: string; productId: string; amount: number; currency?: string;
    variantId?: string; customerEmail?: string; customerName?: string;
  }, @CurrentUser() user: any, @Req() req: any) {
    if (!body.productId || !body.amount) {
      throw new BadRequestException('productId and amount are required');
    }

    // Admin manual orders are the platform's own responsibility — they are attached
    // to an internal platform merchant and NO merchant wallet is charged.
    let platformMerchant = await this.prisma.merchant.findUnique({
      where: { email: 'admin-orders@platform.internal' },
    });
    if (!platformMerchant) {
      platformMerchant = await this.prisma.merchant.create({
        data: {
          name: 'Admin Manual Orders',
          email: 'admin-orders@platform.internal',
          status: 'ACTIVE',
          currency: 'USD',
          allowedProductIds: JSON.stringify([]),
        },
      });
    }

    const result = await this.fulfillmentService.createFulfillment({
      merchantId: platformMerchant.id,
      productId: body.productId,
      amount: Number(body.amount),
      currency: body.currency || 'USD',
      referenceId: `admin-${user.id.slice(0, 8)}-${Date.now()}`,
      idempotencyKey: `admin-manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      actorType: 'ADMIN',
      actorId: user.id,
      ip: req.ip,
      variantId: body.variantId || undefined,
    });
    return result;
  }

  // ─── Emergency stop ───

  @Get('system/emergency')
  async getEmergencyStop() {
    const setting = await this.prisma.platformSetting.findUnique({ where: { key: 'EMERGENCY_STOP' } });
    return { active: setting?.value === 'true', updatedAt: setting?.updatedAt || null };
  }

  @Post('system/emergency')
  @Roles('SUPER_ADMIN')
  async setEmergencyStop(@Body() body: { enabled: boolean }, @CurrentUser() user: any) {
    await this.prisma.platformSetting.upsert({
      where: { key: 'EMERGENCY_STOP' },
      create: { key: 'EMERGENCY_STOP', value: body.enabled ? 'true' : 'false' },
      update: { value: body.enabled ? 'true' : 'false' },
    });
    return { active: body.enabled };
  }

  @Post('codes/:id/reveal')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async revealCode(@Param('id') id: string, @CurrentUser() user: any, @Req() req: any) {
    return this.codesService.revealCode(id, user.id, req.ip);
  }

  @Post('codes/:id/void')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async voidCode(@Param('id') id: string, @CurrentUser() user: any, @Req() req: any) {
    return this.codesService.voidCode(id, user.id, req.ip);
  }

  @Get('inventory/stats')
  async getInventoryStats() {
    return this.codesService.getInventoryStats();
  }

  // ─── Fulfillment Monitoring ───

  @Get('fulfillment')
  async listFulfillment(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.listAllFulfillmentRequests(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Post('fulfillment/:id/reverse')
  @Roles('SUPER_ADMIN')
  async reverseFulfillment(@Param('id') id: string, @CurrentUser() user: any, @Req() req: any) {
    return this.adminService.reverseFulfillment(id, user.id, req.ip);
  }

  @Post('fulfillment/:id/delivery-link/regenerate')
  @Roles('SUPER_ADMIN', 'SUPPORT', 'INVENTORY_MANAGER', 'FINANCE')
  async regenerateDeliveryLink(@Param('id') id: string, @CurrentUser() user: any) {
    return this.deliveryService.regenerateDeliveryLink(id, user.id);
  }

  // ─── Support Inbox ───

  @Get('support/threads')
  @Roles('SUPER_ADMIN', 'SUPPORT', 'FINANCE')
  async listSupportThreads() {
    return this.supportService.adminListThreads();
  }

  @Get('support/threads/:merchantId')
  @Roles('SUPER_ADMIN', 'SUPPORT', 'FINANCE')
  async getSupportThread(@Param('merchantId') merchantId: string) {
    return this.supportService.adminGetThread(merchantId);
  }

  @Post('support/threads/:merchantId/messages')
  @Roles('SUPER_ADMIN', 'SUPPORT', 'FINANCE')
  async replySupportThread(
    @Param('merchantId') merchantId: string,
    @Body() body: { body?: string },
    @CurrentUser() user: any,
  ) {
    return this.supportService.adminSendMessage(merchantId, user.name || user.email, body.body);
  }

  @Get('fulfillment/pending-supplier')
  async listPendingSupplierRequests() {
    const pending = await this.prisma.fulfillmentRequest.findMany({
      where: { status: 'PENDING_SUPPLIER' },
      include: { product: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return {
      items: pending.map((r) => ({
        id: r.id,
        product: r.product.name,
        product_id: r.productId,
        amount: r.amount,
        currency: r.currency,
        reference_id: r.referenceId,
        merchant_id: r.merchantId,
        created_at: r.createdAt,
      })),
      total: pending.length,
    };
  }

  // ─── Staff Management ───

  @Get('staff')
  @Roles('SUPER_ADMIN')
  async listStaff() {
    return this.adminService.listAdminUsers();
  }

  @Post('staff')
  @Roles('SUPER_ADMIN')
  async createStaff(@Body() body: CreateAdminUserDto, @CurrentUser() user: any, @Req() req: any) {
    return this.adminService.createAdminUser(body, user.id, req.ip);
  }

  // ─── Audit & API Logs ───

  @Get('audit-logs')
  async getAuditLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
  ) {
    return this.adminService.getAuditLogs(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
      entity,
      action,
    );
  }

  @Get('api-logs')
  async getApiLogs(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.getApiLogs(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  // ─── Merchant Applications ───

  @Get('merchant-applications')
  async listMerchantApplications(@Query('status') status?: string) {
    return this.authService.listMerchantApplications(status);
  }

  @Post('merchant-applications/:id/approve')
  async approveMerchantApplication(@Param('id') id: string, @CurrentUser() user: any, @Req() req: any) {
    return this.authService.approveMerchantApplication(id, user.id, req.ip);
  }

  @Post('merchant-applications/:id/reject')
  async rejectMerchantApplication(@Param('id') id: string, @Body() body: { note?: string }, @CurrentUser() user: any, @Req() req: any) {
    return this.authService.rejectMerchantApplication(id, user.id, body.note || 'Application rejected', req.ip);
  }

  // ─── Admin Wallet Initialization ───

  @Post('wallet/initialize')
  async initializeWallet(@Body() body: { amount: number; description?: string }, @CurrentUser() user: any, @Req() req: any) {
    return this.walletService.initializeAdminWallet(body.amount, body.description || 'Manual funding', user.id, req.ip);
  }

  // ─── SKU Mapping (Connected Products) ───
  // Admin-wide view across ALL merchants' synced storefront products (WooCommerce, etc.)
  // so the platform's product/denomination/variant can be mapped to each incoming SKU.

  @Post('connected-products')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createConnectedProductAdmin(@Body() body: {
    merchant_id: string; platform: string; platform_sku: string; name: string;
    dcv_product_id?: string; dcv_denomination_id?: string; dcv_variant_id?: string;
  }) {
    if (!body.merchant_id || !body.platform || !body.platform_sku || !body.name) {
      throw new BadRequestException('merchant_id, platform, platform_sku and name are required');
    }
    return this.prisma.connectedProduct.create({
      data: {
        merchantId: body.merchant_id,
        platform: body.platform,
        platformSku: body.platform_sku,
        sku: body.platform_sku,
        name: body.name,
        dcvProductId: body.dcv_product_id || null,
        dcvDenominationId: body.dcv_denomination_id || null,
        dcvVariantId: body.dcv_variant_id || null,
        inventorySource: 'DCV',
        status: 'ACTIVE',
      },
      include: {
        merchant: { select: { id: true, name: true, email: true } },
        dcvProduct: { select: { id: true, name: true, region: true } },
      },
    });
  }

  @Get('connected-products')
  async listConnectedProductsAdmin(@Query('merchantId') merchantId?: string, @Query('unmapped') unmapped?: string) {
    return this.prisma.connectedProduct.findMany({
      where: {
        ...(merchantId ? { merchantId } : {}),
        ...(unmapped === 'true' ? { dcvProductId: null } : {}),
      },
      include: {
        merchant: { select: { id: true, name: true, email: true } },
        dcvProduct: { select: { id: true, name: true, region: true } },
      },
      orderBy: { lastSyncedAt: 'desc' },
      take: 500,
    });
  }

  @Patch('connected-products/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async updateConnectedProductAdmin(
    @Param('id') id: string,
    @Body() body: { dcv_product_id?: string | null; dcv_denomination_id?: string | null; dcv_variant_id?: string | null; sku?: string; inventory_source?: string },
  ) {
    const cp = await this.prisma.connectedProduct.findUnique({ where: { id } });
    if (!cp) throw new NotFoundException('Connected product not found');

    const data: any = {};
    if (body.dcv_product_id !== undefined) data.dcvProductId = body.dcv_product_id || null;
    if (body.dcv_denomination_id !== undefined) data.dcvDenominationId = body.dcv_denomination_id || null;
    if (body.dcv_variant_id !== undefined) data.dcvVariantId = body.dcv_variant_id || null;
    if (body.sku !== undefined) data.platformSku = body.sku || null;
    if (body.inventory_source !== undefined) data.inventorySource = body.inventory_source;

    return this.prisma.connectedProduct.update({
      where: { id },
      data,
      include: {
        merchant: { select: { id: true, name: true, email: true } },
        dcvProduct: { select: { id: true, name: true, region: true } },
      },
    });
  }

  @Delete('connected-products/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async deleteConnectedProductAdmin(@Param('id') id: string) {
    await this.prisma.connectedProduct.delete({ where: { id } });
    return { id, deleted: true };
  }

  @Get('email-logs')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER', 'SUPPORT', 'FINANCE')
  async getEmailLogs(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('recipient') recipient?: string,
  ) {
    const take = Math.min(Number(limit) || 50, 200);
    const where: any = {};
    if (status) where.status = status.toUpperCase();
    if (recipient) where.recipient = { contains: recipient, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          recipient: true,
          subject: true,
          template: true,
          status: true,
          errorMessage: true,
          providerResponse: true,
          retryCount: true,
          createdAt: true,
          sentAt: true,
        },
      }),
      this.prisma.emailLog.count({ where }),
    ]);

    return { items, total };
  }

  // ─── SKU Auto-Generation ───

  @Post('products/auto-generate-skus')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async autoGenerateSkus() {
    // Fetch ALL products with their denominations (not just ones without SKU)
    // because we need to generate per-denomination SKUs too
    const products = await this.prisma.product.findMany({
      include: { denominations: { orderBy: { faceValue: 'asc' } } },
      orderBy: { name: 'asc' },
    });

    // Build a set of existing product SKUs to avoid collisions
    const existingSkus = new Set<string>();
    const allProducts = await this.prisma.product.findMany({ select: { sku: true } });
    for (const p of allProducts) {
      if (p.sku) existingSkus.add(p.sku.toUpperCase());
    }

    const updated: { id: string; name: string; sku: string; denominationSkus: { id: string; faceValue: number; sku: string }[] }[] = [];
    const skipped: { id: string; name: string; reason: string }[] = [];

    for (const product of products) {
      const baseSku = resolveProductSkuBase(product.name, product.region);

      // Generate or update product-level SKU (persisted on Product.sku)
      if (!product.sku) {
        let productSku = baseSku;
        // Ensure uniqueness with numeric suffix if needed
        if (existingSkus.has(productSku.toUpperCase())) {
          let suffix = 1;
          while (existingSkus.has(`${baseSku}-${suffix}`.toUpperCase())) {
            suffix++;
          }
          productSku = `${baseSku}-${suffix}`;
        }
        existingSkus.add(productSku.toUpperCase());
        await this.prisma.product.update({ where: { id: product.id }, data: { sku: productSku } });
      } else {
        existingSkus.add(product.sku.toUpperCase());
      }

      const productSku = product.sku || baseSku;

      // Compute per-denomination SKUs on-the-fly: BASE-FACEVALUE (e.g. PSN-KSA-10)
      // NOT persisted — derived from product SKU + denomination faceValue
      const denominationSkus = product.denominations.map((denom) => ({
        id: denom.id,
        faceValue: Number(denom.faceValue),
        sku: `${baseSku}-${Number(denom.faceValue)}`,
      }));

      if (!product.sku || denominationSkus.length > 0) {
        updated.push({ id: product.id, name: product.name, sku: productSku, denominationSkus });
      } else {
        skipped.push({ id: product.id, name: product.name, reason: 'Product already has SKU' });
      }
    }

    return {
      generated: updated.length,
      skipped_count: skipped.length,
      updated,
      skipped,
    };
  }

  @Get('products/sku-export')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER', 'SUPPORT', 'FINANCE')
  async exportSkus() {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: {
        denominations: {
          orderBy: { faceValue: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const items = products.map((p) => {
      const baseSku = p.sku || resolveProductSkuBase(p.name, p.region);
      return {
        id: p.id,
        name: p.name,
        region: p.region,
        sku: p.sku || '',
        denominations: p.denominations.map((d) => ({
          id: d.id,
          faceValue: Number(d.faceValue),
          currency: d.currency,
          sku: p.sku ? `${baseSku}-${Number(d.faceValue)}` : '',
        })),
      };
    });

    return { items, total: items.length };
  }
}
