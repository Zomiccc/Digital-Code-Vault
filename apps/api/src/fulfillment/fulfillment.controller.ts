import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FulfillmentService } from './fulfillment.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { Scopes } from '../auth/decorators/scopes.decorator';

@Controller('fulfillment')
export class FulfillmentController {
  constructor(private fulfillmentService: FulfillmentService) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  @Scopes('fulfillment')
  async createFulfillment(
    @Body() body: { product_id: string; amount: number; currency?: string; reference_id?: string },
    @Req() req: any,
  ) {
    if (!body.product_id || !body.amount) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_FIELDS',
        message: 'product_id and amount are required',
      });
    }

    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required for fulfillment requests',
      });
    }

    return this.fulfillmentService.createFulfillment({
      merchantId: req.merchantId,
      productId: body.product_id,
      amount: body.amount,
      currency: body.currency || 'USD',
      referenceId: body.reference_id,
      idempotencyKey,
      actorType: 'MERCHANT',
      ip: req.ip,
    });
  }

  @Get(':id')
  @UseGuards(ApiKeyGuard)
  @Scopes('read', 'fulfillment')
  async getFulfillment(@Param('id') id: string, @Req() req: any) {
    return this.fulfillmentService.getFulfillmentStatus(id, req.merchantId);
  }

  @Get(':id/delivery-link')
  @UseGuards(ApiKeyGuard)
  @Scopes('read', 'fulfillment')
  async getDeliveryLink(@Param('id') id: string, @Req() req: any) {
    return this.fulfillmentService.getDeliveryLink(id, req.merchantId);
  }
}

@Controller('orders')
export class OrdersController {
  constructor(private fulfillmentService: FulfillmentService) {}

  @Get(':id/status')
  @UseGuards(ApiKeyGuard)
  @Scopes('read', 'fulfillment')
  async getOrderStatus(@Param('id') id: string, @Req() req: any) {
    return this.fulfillmentService.getOrderStatus(id, req.merchantId);
  }
}

@Controller('sandbox')
export class SandboxController {
  constructor(private fulfillmentService: FulfillmentService) {}

  @Post('fulfillment')
  @UseGuards(ApiKeyGuard)
  @Scopes('fulfillment')
  async sandboxFulfillment(
    @Body() body: { product_id: string; amount: number; currency?: string; reference_id?: string },
    @Req() req: any,
  ) {
    if (!body.product_id || !body.amount) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_FIELDS',
        message: 'product_id and amount are required',
      });
    }

    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required',
      });
    }

    return this.fulfillmentService.createFulfillment({
      merchantId: req.merchantId,
      productId: body.product_id,
      amount: body.amount,
      currency: body.currency || 'USD',
      referenceId: body.reference_id,
      idempotencyKey,
      sandbox: true,
      actorType: 'MERCHANT',
      ip: req.ip,
    });
  }
}
