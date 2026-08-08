import { Controller, Get, Post, Body, Delete, Param, Query, Req, UseGuards } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('wallet')
export class WalletController {
  constructor(private merchantsService: MerchantsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getWallet(@Req() req: any) {
    return this.merchantsService.getWallet(req.user.merchantId);
  }
}

@Controller('merchant')
export class MerchantApiController {
  constructor(private merchantsService: MerchantsService) {}

  @Get('api-keys')
  @UseGuards(JwtAuthGuard)
  async listApiKeys(@Req() req: any) {
    return this.merchantsService.listApiKeys(req.user.merchantId);
  }

  @Post('api-keys')
  @UseGuards(JwtAuthGuard)
  async createApiKey(@Body() body: { scopes?: string[] }, @Req() req: any) {
    return this.merchantsService.createApiKey(req.user.merchantId, body.scopes);
  }

  @Delete('api-keys/:id')
  @UseGuards(JwtAuthGuard)
  async revokeApiKey(@Param('id') id: string, @Req() req: any) {
    return this.merchantsService.revokeApiKey(req.user.merchantId, id);
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard)
  async listOrders(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.merchantsService.listFulfillmentRequests(
      req.user.merchantId,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }
}
