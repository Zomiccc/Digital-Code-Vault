import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WebhookService } from '../webhooks/webhook.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { nanoid } from 'nanoid';
import { CreateApiKeyDto, CreateWebhookDto, CreateFulfillmentDto } from '../dto';

@Controller('merchant')
export class MerchantDashboardController {
  constructor(
    private merchantsService: MerchantsService,
    private webhookService: WebhookService,
    private fulfillmentService: FulfillmentService,
  ) {}

  @Get('dashboard/wallet')
  @UseGuards(JwtAuthGuard)
  async getWallet(@Req() req: any) {
    return this.merchantsService.getWallet(req.user.merchantId);
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
}
