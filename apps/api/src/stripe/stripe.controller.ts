import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Req,
  Res,
  Query,
  Param,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StripeService } from './stripe.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('stripe')
export class StripeController {
  constructor(
    private stripeService: StripeService,
    private prisma: PrismaService,
  ) {}

  // ─── Merchant Wallet Funding ───

  @Post('merchant-funding/create-session')
  @UseGuards(JwtAuthGuard)
  async createMerchantFundingSession(@Body() body: any, @Req() req: any) {
    if (!body.amount || body.amount <= 0) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'INVALID_AMOUNT',
        message: 'Amount must be greater than 0',
      });
    }

    return this.stripeService.createMerchantFundingSession({
      merchantId: req.user.merchantId,
      amount: body.amount,
      currency: body.currency || 'USD',
    });
  }

  @Get('merchant-funding/success')
  async merchantFundingSuccess(
    @Query('session_id') sessionId: string,
    @Res() res: Response,
  ) {
    const baseUrl = process.env.APP_URL || 'http://localhost:5173';
    res.redirect(302, `${baseUrl}/merchant/wallet?stripe_status=success&session_id=${sessionId}`);
  }

  @Get('merchant-funding/cancel')
  async merchantFundingCancel(
    @Query('session_id') sessionId: string,
    @Res() res: Response,
  ) {
    const baseUrl = process.env.APP_URL || 'http://localhost:5173';
    res.redirect(302, `${baseUrl}/merchant/wallet?stripe_status=canceled&session_id=${sessionId}`);
  }

  // ─── Customer Purchase ───

  @Post('customer-purchase/create-session')
  async createCustomerPurchaseSession(@Body() body: any, @Req() req: any) {
    if (!body.product_id || !body.amount || !body.customer_email) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_FIELDS',
        message: 'product_id, amount, and customer_email are required',
      });
    }

    let customerId: string | undefined;
    if (req.user?.id) {
      customerId = req.user.id;
    }

    return this.stripeService.createCustomerPurchaseSession({
      customerEmail: body.customer_email,
      customerName: body.customer_name,
      customerId,
      productId: body.product_id,
      denominationId: body.denomination_id,
      amount: body.amount,
      currency: body.currency || 'USD',
    });
  }

  @Post('customer-purchase/authenticated/create-session')
  @UseGuards(CustomerAuthGuard)
  async createAuthenticatedPurchaseSession(@Body() body: any, @Req() req: any) {
    if (!body.product_id || !body.amount) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        code: 'MISSING_FIELDS',
        message: 'product_id and amount are required',
      });
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: req.user.id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.stripeService.createCustomerPurchaseSession({
      customerEmail: customer.email,
      customerName: customer.name,
      customerId: customer.id,
      productId: body.product_id,
      denominationId: body.denomination_id,
      amount: body.amount,
      currency: body.currency || 'USD',
    });
  }

  @Get('customer-purchase/success')
  async customerPurchaseSuccess(
    @Query('session_id') sessionId: string,
    @Res() res: Response,
  ) {
    const baseUrl = process.env.APP_URL || 'http://localhost:5173';
    res.redirect(302, `${baseUrl}/customer/purchase-success?session_id=${sessionId}`);
  }

  @Get('customer-purchase/cancel')
  async customerPurchaseCancel(
    @Query('session_id') sessionId: string,
    @Res() res: Response,
  ) {
    const baseUrl = process.env.APP_URL || 'http://localhost:5173';
    res.redirect(302, `${baseUrl}/customer/browse?stripe_status=canceled`);
  }

  // ─── Stripe Webhook ───

  @Post('webhook')
  async handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }

    try {
      const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
      const result = await this.stripeService.handleWebhookEvent(rawBody, signature);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  // ─── Status / Lookup ───

  @Get('publishable-key')
  async getPublishableKey() {
    return { publishable_key: this.stripeService.getPublishableKey() };
  }

  @Get('payment/:id')
  async getPaymentRecord(@Param('id') id: string) {
    return this.stripeService.getPaymentRecord(id);
  }

  @Get('order/:id')
  async getCustomerOrder(@Param('id') id: string) {
    return this.stripeService.getCustomerOrder(id);
  }

  // ─── Admin: List payment records ───

  @Get('payments')
  @UseGuards(JwtAuthGuard)
  async listPayments(
    @Query('paymentType') paymentType?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.stripeService.listPaymentRecords({
      paymentType,
      status,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
  }
}
