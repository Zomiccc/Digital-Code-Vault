import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { Scopes } from '../auth/decorators/scopes.decorator';

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
  async registerEndpoint(@Body() body: { url: string }, @Req() req: any) {
    if (!body.url) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_URL',
        message: 'url is required',
      });
    }
    return this.webhookService.registerEndpoint(req.merchantId, body.url);
  }

  @Delete('endpoints/:id')
  @UseGuards(ApiKeyGuard)
  @Scopes('fulfillment')
  async deleteEndpoint(@Param('id') id: string, @Req() req: any) {
    return this.webhookService.deleteEndpoint(req.merchantId, id);
  }
}
