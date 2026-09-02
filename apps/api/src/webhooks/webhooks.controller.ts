import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards, BadRequestException, Headers } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Scopes } from '../auth/decorators/scopes.decorator';
import { CreateWebhookDto } from '../dto';

@Controller('webhooks')
export class WebhooksController {
  constructor(private webhookService: WebhookService) {}

  @Get('endpoints')
  @UseGuards(ApiKeyGuard)
  @Scopes('read')
  async listEndpoints(@Req() req: any) {
    return this.webhookService.listEndpoints(req.merchantId);
  }

  @Post('endpoints')
  @UseGuards(ApiKeyGuard)
  @Scopes('fulfillment')
  async registerEndpoint(@Body() body: CreateWebhookDto & { skipVerification?: boolean }, @Req() req: any) {
    if (!body.url) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_URL',
        message: 'url is required',
      });
    }
    return this.webhookService.registerEndpoint(req.merchantId, body.url, body.skipVerification || false);
  }

  @Delete('endpoints/:id')
  @UseGuards(ApiKeyGuard)
  @Scopes('fulfillment')
  async deleteEndpoint(@Param('id') id: string, @Req() req: any) {
    return this.webhookService.deleteEndpoint(req.merchantId, id);
  }

  @Post('incoming')
  async receiveIncomingWebhook(@Body() payload: any, @Headers() headers: any, @Req() req: any) {
    return this.webhookService.processIncomingWebhook(payload, headers, req.ip);
  }

  @Get('incoming')
  @UseGuards(JwtAuthGuard)
  async listIncomingWebhooks(@Req() req: any) {
    return this.webhookService.listIncomingWebhooks(req.user.merchantId);
  }

  @Post('incoming/:id/retry')
  @UseGuards(JwtAuthGuard)
  async retryIncomingWebhook(@Param('id') id: string, @Req() req: any) {
    return this.webhookService.retryIncomingWebhook(id, req.user.merchantId);
  }

  @Get('connected-products')
  @UseGuards(JwtAuthGuard)
  async listConnectedProducts(@Req() req: any) {
    return this.webhookService.listConnectedProducts(req.user.merchantId);
  }

  @Put('connected-products/:id')
  @UseGuards(JwtAuthGuard)
  async updateConnectedProduct(
    @Param('id') id: string,
    @Body() body: { dcv_product_id?: string; dcv_denomination_id?: string | null; dcv_variant_id?: string | null; inventory_source?: string },
    @Req() req: any,
  ) {
    return this.webhookService.updateConnectedProductMapping(
      id,
      req.user.merchantId,
      body.dcv_product_id,
      body.dcv_denomination_id,
      body.inventory_source,
      body.dcv_variant_id,
    );
  }

  @Get('debug/order/:orderId')
  async debugOrderWebhooks(@Param('orderId') orderId: string) {
    const webhooks = await this.webhookService.listWebhooksByOrderId(orderId);
    return webhooks.map((w: any) => ({
      id: w.id,
      eventId: w.eventId,
      orderId: w.orderId,
      productSku: w.productSku,
      productName: w.productName,
      processingStatus: w.processingStatus,
      errorMessage: w.errorMessage,
      createdAt: w.createdAt,
      rawPayload: w.rawPayload ? JSON.parse(w.rawPayload) : null,
    }));
  }

  @Get('statistics')
  @UseGuards(JwtAuthGuard)
  async getWebhookStatistics(@Req() req: any) {
    return this.webhookService.getWebhookStatistics(req.user.merchantId);
  }
}
