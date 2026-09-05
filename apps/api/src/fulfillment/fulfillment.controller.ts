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
import { ProductsService } from '../products/products.service';

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
      variantId: body.variant_id,
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

/**
 * The SKU catalogue a storefront pulls to connect its own products. A store
 * product carrying the same SKU is matched to this product when its orders
 * arrive, which is what links the two systems together.
 */
@Controller('catalog')
export class CatalogSkuController {
  constructor(private productsService: ProductsService) {}

  @Get('skus')
  @UseGuards(ApiKeyGuard)
  @Scopes('read', 'fulfillment')
  async listSkus(@Req() req: any) {
    const products = await this.productsService.listProductsForMerchant(req.merchantId);
    return {
      items: products
        .filter((product: any) => product.sku)
        .map((product: any) => ({
          sku: product.sku,
          name: product.name,
          region: product.region,
          currency: product.regional_currency,
          symbol: product.regional_symbol,
          denominations: product.denominations.map((denomination: any) => ({
            sku: `${product.sku}-${Number(denomination.faceValue)}`,
            face_value: Number(denomination.faceValue),
            price_usd: denomination.amount_usd,
            price_local: denomination.local_amount,
            price_formatted: denomination.local_formatted,
            in_stock: denomination.availableCount ?? null,
          })),
        })),
    };
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
      variantId: body.variant_id,
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
