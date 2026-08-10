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
import { CreateFulfillmentDto } from '../dto';

@Controller('fulfillment')
export class FulfillmentController {
  constructor(private fulfillmentService: FulfillmentService) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  @Scopes('fulfillment')
  async createFulfillment(
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
      customerEmail: body.customer_email,
      customerName: body.customer_name,
      customerAddress: body.customer_address,
      actorType: 'MERCHANT',
      ip: req.ip,
      inventorySource: body.inventory_source,
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

@Controller('notify')
export class PaymentNotificationController {
  constructor(private fulfillmentService: FulfillmentService) {}

  /**
   * POST /api/v1/notify/payment
   * Merchant notifies CodeHub after payment is confirmed.
   * CodeHub allocates codes from the vault, generates a permanent reveal link,
   * and sends an email directly to the customer.
   *
   * Uses API key + HMAC authentication (same as other merchant endpoints).
   */
  @Post('payment')
  @UseGuards(ApiKeyGuard)
  @Scopes('fulfillment')
  async notifyPayment(
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

    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required for payment notifications',
      });
    }

    return this.fulfillmentService.createFulfillment({
      merchantId: req.merchantId,
      productId: body.product_id,
      amount: body.amount,
      currency: body.currency || 'USD',
      referenceId: body.reference_id,
      idempotencyKey,
      customerEmail: body.customer_email,
      customerName: body.customer_name,
      customerAddress: body.customer_address,
      actorType: 'MERCHANT',
      ip: req.ip,
      inventorySource: body.inventory_source,
    });
  }
}

@Controller('sandbox')
export class SandboxController {
  constructor(private fulfillmentService: FulfillmentService) {}

  @Post('fulfillment')
  @UseGuards(ApiKeyGuard)
  @Scopes('fulfillment')
  async sandboxFulfillment(
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
      customerAddress: body.customer_address,
      sandbox: true,
      actorType: 'MERCHANT',
      ip: req.ip,
      inventorySource: body.inventory_source,
    });
  }
}
