import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req,
  UseGuards, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { MerchantsService } from '../merchants/merchants.service';
import { ProductsService } from '../products/products.service';
import { CodesService } from '../codes/codes.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
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

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private merchantsService: MerchantsService,
    private productsService: ProductsService,
    private codesService: CodesService,
    private authService: AuthService,
    private prisma: PrismaService,
    private walletService: WalletService,
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

  // ─── Admin Wallet / Finance ───

  @Get('wallet')
  async getAdminWallet() {
    return this.walletService.getAdminWallet();
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
    return this.walletService.approveFundingRequest(id, user.id, body.note, req.ip);
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
    return this.productsService.createProduct(body);
  }

  @Post('products/:id/denominations')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createDenomination(@Param('id') id: string, @Body() body: CreateDenominationDto) {
    return this.productsService.createDenomination(id, body.face_value, body.currency);
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
    );
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
}
