import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req,
  UseGuards, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { MerchantsService } from '../merchants/merchants.service';
import { ProductsService } from '../products/products.service';
import { CodesService } from '../codes/codes.service';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private merchantsService: MerchantsService,
    private productsService: ProductsService,
    private codesService: CodesService,
    private authService: AuthService,
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
  async createMerchant(@Body() body: any, @CurrentUser() user: any, @Req() req: any) {
    return this.merchantsService.createMerchant(body);
  }

  @Patch('merchants/:id/status')
  @Roles('SUPER_ADMIN')
  async updateMerchantStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.merchantsService.updateMerchantStatus(id, body.status as any);
  }

  @Post('merchants/:id/wallet/credit')
  @Roles('SUPER_ADMIN', 'FINANCE')
  async creditWallet(@Param('id') id: string, @Body() body: { amount: number }, @CurrentUser() user: any, @Req() req: any) {
    return this.merchantsService.addWalletCredit(id, body.amount, user.id, req.ip);
  }

  // ─── Products & Denominations ───

  @Get('products')
  async listProducts() {
    return this.productsService.listAllProducts();
  }

  @Post('products')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createProduct(@Body() body: any) {
    return this.productsService.createProduct(body);
  }

  @Post('products/:id/denominations')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createDenomination(@Param('id') id: string, @Body() body: { face_value: number; currency?: string }) {
    return this.productsService.createDenomination(id, body.face_value, body.currency);
  }

  // ─── Suppliers ───

  @Get('suppliers')
  async listSuppliers() {
    return this.adminService.listSuppliers();
  }

  @Post('suppliers')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createSupplier(@Body() body: any) {
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
    @Body() body: { denomination_id: string; codes: string[]; supplier_id?: string },
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

  // ─── Staff Management ───

  @Get('staff')
  @Roles('SUPER_ADMIN')
  async listStaff() {
    return this.adminService.listAdminUsers();
  }

  @Post('staff')
  @Roles('SUPER_ADMIN')
  async createStaff(@Body() body: any, @CurrentUser() user: any, @Req() req: any) {
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
}
