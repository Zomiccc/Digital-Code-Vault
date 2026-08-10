import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WebhookService } from '../webhooks/webhook.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { WalletService } from '../wallet/wallet.service';
import { CodesService } from '../codes/codes.service';
import { ProductsService } from '../products/products.service';
import { nanoid } from 'nanoid';
import { CreateApiKeyDto, CreateWebhookDto, CreateFulfillmentDto, CreateFundingRequestDto } from '../dto';

@Controller('merchant')
export class MerchantDashboardController {
  constructor(
    private merchantsService: MerchantsService,
    private webhookService: WebhookService,
    private fulfillmentService: FulfillmentService,
    private codesService: CodesService,
    private productsService: ProductsService,
    private walletService: WalletService,
  ) {}

  @Get('dashboard/wallet')
  @UseGuards(JwtAuthGuard)
  async getWallet(@Req() req: any) {
    return this.merchantsService.getWallet(req.user.merchantId);
  }

  @Get('dashboard/funding-requests')
  @UseGuards(JwtAuthGuard)
  async listMyFundingRequests(@Req() req: any) {
    return this.walletService.listFundingRequests(req.user.merchantId);
  }

  @Post('dashboard/funding-requests')
  @UseGuards(JwtAuthGuard)
  async createFundingRequest(@Body() body: CreateFundingRequestDto, @Req() req: any) {
    return this.walletService.createFundingRequest(req.user.merchantId, body.amount, body.note);
  }

  @Get('dashboard/orders')
  @UseGuards(JwtAuthGuard)
  async listOrders(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.merchantsService.listFulfillmentRequests(
      req.user.merchantId,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Get('dashboard/api-keys')
  @UseGuards(JwtAuthGuard)
  async listApiKeys(@Req() req: any) {
    return this.merchantsService.listApiKeys(req.user.merchantId);
  }

  @Post('dashboard/api-keys')
  @UseGuards(JwtAuthGuard)
  async createApiKey(@Body() body: CreateApiKeyDto, @Req() req: any) {
    return this.merchantsService.createApiKey(req.user.merchantId, body.scopes);
  }

  // ─── Dashboard Fulfillment (JWT-guarded, no HMAC needed) ───

  @Post('dashboard/fulfillment')
  @UseGuards(JwtAuthGuard)
  async createDashboardFulfillment(
    @Body() body: CreateFulfillmentDto,
    @Req() req: any,
  ) {
    if (!body.product_id || !body.amount) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_FIELDS',
        message: 'product_id and amount are required',
      });
    }

    const idempotencyKey = `dashboard-${nanoid(16)}`;

    return this.fulfillmentService.createFulfillment({
      merchantId: req.user.merchantId,
      productId: body.product_id,
      amount: body.amount,
      currency: body.currency || 'USD',
      referenceId: body.reference_id,
      idempotencyKey,
      customerEmail: body.customer_email,
      customerName: body.customer_name,
      actorType: 'MERCHANT',
      actorId: req.user.id,
      ip: req.ip,
      inventorySource: body.inventory_source,
    });
  }

  // ─── Webhook Management (JWT-guarded for dashboard) ───

  @Get('webhooks')
  @UseGuards(JwtAuthGuard)
  async listWebhooks(@Req() req: any) {
    return this.webhookService.listEndpoints(req.user.merchantId);
  }

  @Post('webhooks')
  @UseGuards(JwtAuthGuard)
  async createWebhook(@Body() body: CreateWebhookDto, @Req() req: any) {
    if (!body.url) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_URL',
        message: 'url is required',
      });
    }
    return this.webhookService.registerEndpoint(req.user.merchantId, body.url, body.skipVerification || false);
  }

  @Delete('webhooks/:id')
  @UseGuards(JwtAuthGuard)
  async deleteWebhook(@Param('id') id: string, @Req() req: any) {
    return this.webhookService.deleteEndpoint(req.user.merchantId, id);
  }

  @Get('webhook-secret')
  @UseGuards(JwtAuthGuard)
  async getWebhookSecret(@Req() req: any) {
    return this.merchantsService.getWebhookSecret(req.user.merchantId);
  }

  @Post('webhook-secret/regenerate')
  @UseGuards(JwtAuthGuard)
  async regenerateWebhookSecret(@Req() req: any) {
    return this.merchantsService.regenerateWebhookSecret(req.user.merchantId);
  }

  // ─── Merchant Inventory Management ───

  @Get('dashboard/inventory')
  @UseGuards(JwtAuthGuard)
  async listInventory(
    @Req() req: any,
    @Query('denominationId') denominationId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.codesService.listMerchantCodes(req.user.merchantId, {
      denominationId,
      status,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
  }

  @Get('dashboard/inventory/stats')
  @UseGuards(JwtAuthGuard)
  async getInventoryStats(@Req() req: any) {
    return this.codesService.getMerchantInventoryStats(req.user.merchantId);
  }

  @Post('dashboard/inventory/upload')
  @UseGuards(JwtAuthGuard)
  async uploadCodes(
    @Body() body: { denomination_id: string; codes: string[] },
    @Req() req: any,
  ) {
    if (!body.denomination_id || !body.codes || !Array.isArray(body.codes)) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_FIELDS',
        message: 'denomination_id and codes array are required',
      });
    }

    return this.codesService.merchantBulkUpload(
      body.denomination_id,
      body.codes,
      req.user.merchantId,
      req.ip,
    );
  }

  @Post('dashboard/inventory/:id/void')
  @UseGuards(JwtAuthGuard)
  async voidCode(@Param('id') id: string, @Req() req: any) {
    return this.codesService.voidMerchantCode(id, req.user.merchantId, req.ip);
  }

  @Get('dashboard/products')
  @UseGuards(JwtAuthGuard)
  async listProducts(@Req() req: any) {
    return this.productsService.listProductsForMerchant(req.user.merchantId);
  }
}
