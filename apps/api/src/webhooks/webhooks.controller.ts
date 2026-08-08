import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards, BadRequestException, Headers } from '@nestjs/common';
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

  @Get('statistics')
  @UseGuards(JwtAuthGuard)
  async getWebhookStatistics(@Req() req: any) {
    return this.webhookService.getWebhookStatistics(req.user.merchantId);
  }
}
