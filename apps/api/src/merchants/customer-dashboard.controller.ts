import { Controller, Get, Post, Body, Req, UseGuards, BadRequestException, Param } from '@nestjs/common';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from '../products/products.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { PrismaService } from '../prisma/prisma.service';
import { nanoid } from 'nanoid';

@Controller('customer')
export class CustomerDashboardController {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private auditService: AuditService,
    private productsService: ProductsService,
    private fulfillmentService: FulfillmentService,
  ) {}

  @Get('products')
  @UseGuards(CustomerAuthGuard)
  async listProducts() {
    return this.productsService.listAllProducts();
  }

  @Get('products/:id/denominations')
  @UseGuards(CustomerAuthGuard)
  async getDenominations(@Param('id') id: string) {
    return this.productsService.getDenominations(id);
  }

  @Post('orders')
  @UseGuards(CustomerAuthGuard)
  async createOrder(@Body() body: any, @Req() req: any) {
    if (!body.product_id || !body.amount) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_FIELDS',
        message: 'product_id and amount are required',
      });
    }

    // Customers need a merchant to fulfill through - use the first active merchant
    // In a real system, the customer would pick a merchant/store
    const merchants = await this.prisma.merchant.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { walletBalance: 'desc' },
      take: 1,
    });

    if (merchants.length === 0) {
      throw new BadRequestException({
        error: 'NO_MERCHANT',
        code: 'NO_ACTIVE_MERCHANT',
        message: 'No active merchant available to fulfill orders',
      });
    }

    const merchant = merchants[0];
    const idempotencyKey = `customer-${nanoid(16)}`;

    // Fetch the authenticated customer's email and name from the database
    const customer = await this.prisma.customer.findUnique({ where: { id: req.user.id } });
    const customerEmail = customer?.email || undefined;
    const customerName = customer?.name || customerEmail || undefined;

    try {
      const result = await this.fulfillmentService.createFulfillment({
        merchantId: merchant.id,
        productId: body.product_id,
        amount: body.amount,
        currency: body.currency || 'USD',
        referenceId: body.reference_id || `cust-${req.user.id}`,
        idempotencyKey,
        customerEmail,
        customerName,
        customerAddress: body.customer_address,
        actorType: 'SYSTEM',
        actorId: req.user.id,
        ip: req.ip,
      });

      // Store the order against the customer
      await this.auditService.log({
        actorType: 'CUSTOMER',
        actorId: req.user.id,
        action: 'customer.order',
        entity: 'FulfillmentRequest',
        entityId: result.fulfillment_id,
        metadata: { merchantId: merchant.id, productId: body.product_id, amount: body.amount },
        ip: req.ip,
      });

      return result;
    } catch (err: any) {
      // If stock is insufficient, create a PENDING_SUPPLIER request
      // The admin will upload codes, and the system auto-fulfills it
      const isStockError =
        err.message?.includes('INSUFFICIENT_STOCK') ||
        err.response?.message?.includes('INSUFFICIENT_STOCK') ||
        err.response?.code === 'INSUFFICIENT_STOCK' ||
        (err.response?.message && typeof err.response.message === 'string' && err.response.message.includes('No available stock')) ||
        (err.response?.message && typeof err.response.message === 'string' && err.response.message.includes('No combination'));

      if (isStockError) {
        // Use a new idempotency key since createFulfillment may have used the original
        const pendingIdempotencyKey = `customer-pending-${nanoid(16)}`;

        const pendingReq = await this.prisma.fulfillmentRequest.create({
          data: {
            merchantId: merchant.id,
            productId: body.product_id,
            amount: body.amount,
            currency: body.currency || 'USD',
            idempotencyKey: pendingIdempotencyKey,
            referenceId: body.reference_id || `cust-${req.user.id}`,
            status: 'PENDING_SUPPLIER',
            sandbox: false,
            customerEmail: customerEmail || null,
            customerName: customerName || null,
            customerAddress: body.customer_address || null,
          },
        }).catch(() => null);

        if (pendingReq) {
          await this.auditService.log({
            actorType: 'CUSTOMER',
            actorId: req.user.id,
            action: 'customer.order_pending_supplier',
            entity: 'FulfillmentRequest',
            entityId: pendingReq.id,
            metadata: { merchantId: merchant.id, productId: body.product_id, amount: body.amount },
            ip: req.ip,
          });

          return {
            fulfillment_id: pendingReq.id,
            status: 'PENDING_SUPPLIER',
            message: 'Your order has been placed and is awaiting stock. You will receive a delivery link once codes become available.',
          };
        }
      }
      throw err;
    }
  }

  @Get('orders')
  @UseGuards(CustomerAuthGuard)
  async listOrders(@Req() req: any) {
    // Get fulfillment requests where the customer is the actor
    const logs = await this.prisma.auditLog.findMany({
      where: {
        actorType: 'CUSTOMER',
        actorId: req.user.id,
        action: { in: ['customer.order', 'customer.order_pending_supplier'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const fulfillmentIds = logs.map((l: any) => l.entityId).filter(Boolean);
    if (fulfillmentIds.length === 0) return [];

    const fulfillments = await this.prisma.fulfillmentRequest.findMany({
      where: { id: { in: fulfillmentIds } },
      include: {
        product: true,
        deliveryToken: true,
        allocations: true,
      },
    });

    return fulfillments.map((f: any) => ({
      id: f.id,
      product_name: f.product.name,
      amount: f.amount,
      status: f.status,
      failureReason: f.failureReason,
      createdAt: f.createdAt,
      customer_address: f.customerAddress,
      delivery_link: f.deliveryToken
        ? `/api/v1/reveal/${f.deliveryToken.tokenHash}`
        : null,
      revealed: f.deliveryToken?.revealedAt ? true : false,
    }));
  }

  @Post('become-merchant')
  @UseGuards(CustomerAuthGuard)
  async becomeMerchant(@Body() body: any, @Req() req: any) {
    const required = ['storeName', 'storeEmail', 'firstName', 'lastName', 'phone', 'idDocType', 'idFrontImage', 'idBackImage', 'businessNtn'];
    const missing = required.filter((f) => !body[f]);
    if (missing.length > 0) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_FIELDS',
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    return this.authService.customerBecomeMerchant(
      req.user.id,
      {
        storeName: body.storeName,
        storeEmail: body.storeEmail,
        currency: body.currency,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        idDocType: body.idDocType,
        idFrontImage: body.idFrontImage,
        idBackImage: body.idBackImage,
        businessNtn: body.businessNtn,
      },
      req.ip,
    );
  }

  @Get('profile')
  @UseGuards(CustomerAuthGuard)
  async getProfile(@Req() req: any) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: req.user.id },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found');
    }
    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      merchantId: customer.merchantId,
      isMerchant: !!customer.merchantId,
      merchantAppStatus: customer.merchantAppStatus,
    };
  }
}
