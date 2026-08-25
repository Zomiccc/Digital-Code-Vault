import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
const PDFKit = require('pdfkit');
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly provider: string;
  private smtpTransport: nodemailer.Transporter | null = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.provider = this.configService.get<string>('EMAIL_PROVIDER') || 'resend';

    if (this.provider === 'sendgrid') {
      this.apiKey = this.configService.get<string>('SENDGRID_API_KEY') || '';
      this.fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL') || 'noreply@digitalcode.local';
      this.fromName = this.configService.get<string>('SENDGRID_FROM_NAME') || 'CodeHub';
    } else if (this.provider === 'smtp') {
      this.apiKey = '';
      const smtpHost = this.configService.get<string>('SMTP_HOST') || '';
      const smtpPort = this.configService.get<number>('SMTP_PORT', 587);
      const smtpUser = this.configService.get<string>('SMTP_USER') || '';
      const smtpPassword = this.configService.get<string>('SMTP_PASSWORD') || '';
      this.fromEmail = this.configService.get<string>('SMTP_FROM') || smtpUser || 'noreply@digitalcode.local';
      this.fromName = 'CodeHub';

      if (smtpHost && smtpUser && smtpPassword) {
        this.smtpTransport = nodemailer.createTransport({
          host: smtpHost,
          port: Number(smtpPort),
          secure: Number(smtpPort) === 465,
          auth: { user: smtpUser, pass: smtpPassword },
        });
      } else {
        this.logger.error('EMAIL_PROVIDER=smtp but SMTP_HOST/SMTP_USER/SMTP_PASSWORD are not fully configured. Email sending will fail.');
      }
    } else {
      this.apiKey = this.configService.get<string>('RESEND_API_KEY') || '';
      this.fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
      this.fromName = 'CodeHub';
    }
  }

  /**
   * Sends an email via Resend with retry logic and logging.
   * Returns true on success, false on failure.
   */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    options?: {
      text?: string;
      attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
      merchantId?: string;
      template?: string;
    },
  ): Promise<boolean> {
    const maxRetries = 3;
    const baseDelay = 1000;

    const emailLog = await this.prisma.emailLog.create({
      data: {
        merchantId: options?.merchantId || null,
        recipient: to,
        subject,
        template: options?.template || null,
        status: 'PENDING',
      },
    }).catch(() => null);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.provider === 'smtp') {
          if (!this.smtpTransport) {
            this.logger.error('SMTP transport not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASSWORD). Refusing to fake a successful send.');
            if (emailLog) {
              await this.prisma.emailLog.update({
                where: { id: emailLog.id },
                data: { status: 'FAILED', errorMessage: 'SMTP transport not configured', retryCount: attempt },
              }).catch(() => {});
            }
            return false;
          }

          const info = await this.smtpTransport.sendMail({
            from: `${this.fromName} <${this.fromEmail}>`,
            to,
            subject,
            html,
            text: options?.text,
            attachments: options?.attachments?.map((att) => ({
              filename: att.filename,
              content: att.content,
              contentType: att.contentType,
            })),
          });

          this.logger.log(`Email sent to ${to} via smtp (id: ${info.messageId})`);
          if (emailLog) {
            await this.prisma.emailLog.update({
              where: { id: emailLog.id },
              data: { status: 'SENT', providerResponse: info.messageId, sentAt: new Date() },
            }).catch(() => {});
          }
          return true;
        }

        let response: Response;

        if (this.provider === 'sendgrid') {
          response = await this.sendViaSendGrid(to, subject, html, options);
        } else {
          response = await this.sendViaResend(to, subject, html, options);
        }

        if (response.status >= 200 && response.status < 300) {
          const data = await response.json().catch(() => ({}));
          const messageId = data.id || data.message_id || 'sendgrid-accepted';
          this.logger.log(`Email sent to ${to} via ${this.provider} (id: ${messageId})`);
          if (emailLog) {
            await this.prisma.emailLog.update({
              where: { id: emailLog.id },
              data: { status: 'SENT', providerResponse: messageId, sentAt: new Date() },
            }).catch(() => {});
          }
          return true;
        } else {
          const errorText = await response.text();
          this.logger.error(`Email send failed via ${this.provider} (attempt ${attempt}/${maxRetries}): ${response.status} ${errorText}`);

          if (attempt < maxRetries && response.status >= 500) {
            await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
            continue;
          }
          if (emailLog) {
            await this.prisma.emailLog.update({
              where: { id: emailLog.id },
              data: { status: 'FAILED', errorMessage: `${response.status} ${errorText}`, retryCount: attempt },
            }).catch(() => {});
          }
          return false;
        }
      } catch (err) {
        this.logger.error(`Email send error via ${this.provider} (attempt ${attempt}/${maxRetries}): ${(err as Error).message}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
          continue;
        }
        if (emailLog) {
          await this.prisma.emailLog.update({
            where: { id: emailLog.id },
            data: { status: 'FAILED', errorMessage: (err as Error).message, retryCount: attempt },
          }).catch(() => {});
        }
        return false;
      }
    }
    return false;
  }

  private async sendViaResend(
    to: string,
    subject: string,
    html: string,
    options?: { text?: string; attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }> },
  ): Promise<Response> {
    const body: any = {
      from: this.fromEmail,
      to,
      subject,
      html,
    };

    if (options?.text) body.text = options.text;

    if (options?.attachments && options.attachments.length > 0) {
      body.attachments = options.attachments.map((att) => ({
        filename: att.filename,
        content: att.content.toString('base64'),
        content_type: att.contentType || 'application/octet-stream',
      }));
    }

    return fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  }

  private async sendViaSendGrid(
    to: string,
    subject: string,
    html: string,
    options?: { text?: string; attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }> },
  ): Promise<Response> {
    const body: any = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: this.fromEmail, name: this.fromName },
      subject,
      content: [
        { type: 'text/html', value: html },
      ],
    };

    if (options?.text) {
      body.content.unshift({ type: 'text/plain', value: options.text });
    }

    if (options?.attachments && options.attachments.length > 0) {
      body.attachments = options.attachments.map((att) => ({
        filename: att.filename,
        content: att.content.toString('base64'),
        type: att.contentType || 'application/octet-stream',
        disposition: 'attachment',
      }));
    }

    return fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  }

  /**
   * Generates a PDF invoice for a completed order.
   */
  async generateInvoice(params: {
    invoiceNumber: string;
    customerName: string;
    customerEmail: string;
    merchantName: string;
    merchantAddress?: string;
    product: string;
    quantity: number;
    price: number;
    subtotal: number;
    tax: number;
    total: number;
    paymentMethod: string;
    date: string;
    billingAddress?: string;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFKit({ margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#0f172a').text('Code Vault', { align: 'center' });
        doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Digital Code Marketplace', { align: 'center' });
        doc.moveDown(0.5);

        // Invoice info
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text(`Invoice #${params.invoiceNumber}`, { align: 'right' });
        doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(`Date: ${params.date}`, { align: 'right' });
        doc.moveDown(1);

        // From / To
        doc.fontSize(10).font('Helvetica').fillColor('#0f172a');
        doc.text('From:', { continued: true }).font('Helvetica-Bold').text(` ${params.merchantName}`);
        if (params.merchantAddress) {
          doc.font('Helvetica').text(params.merchantAddress);
        }
        doc.moveDown(0.3);
        doc.font('Helvetica').text('To:', { continued: true }).font('Helvetica-Bold').text(` ${params.customerName}`);
        doc.font('Helvetica').text(params.customerEmail);
        if (params.billingAddress) {
          doc.font('Helvetica').text(params.billingAddress);
        }
        doc.moveDown(1);

        // Line items table
        const tableTop = doc.y;
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
        doc.text('Product', 50, tableTop);
        doc.text('Qty', 250, tableTop, { width: 40, align: 'right' });
        doc.text('Price', 310, tableTop, { width: 60, align: 'right' });
        doc.text('Total', 390, tableTop, { width: 60, align: 'right' });
        doc.moveDown(0.3);

        doc.font('Helvetica').fontSize(9).fillColor('#000000');
        doc.text(params.product, 50, tableTop + 20);
        doc.text(String(params.quantity), 250, tableTop + 20, { width: 40, align: 'right' });
        doc.text(`$${params.price.toFixed(2)}`, 310, tableTop + 20, { width: 60, align: 'right' });
        doc.text(`$${params.total.toFixed(2)}`, 390, tableTop + 20, { width: 60, align: 'right' });
        doc.moveDown(1);

        // Totals
        const totalsTop = doc.y + 20;
        doc.font('Helvetica').fontSize(9).fillColor('#64748b');
        doc.text('Subtotal:', 310, totalsTop, { width: 80, align: 'right' });
        doc.text(`$${params.subtotal.toFixed(2)}`, 400, totalsTop, { width: 60, align: 'right' });
        doc.moveDown(0.2);
        doc.text('Tax:', 310, doc.y, { width: 80, align: 'right' });
        doc.text(`$${params.tax.toFixed(2)}`, 400, doc.y, { width: 60, align: 'right' });
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fillColor('#0f172a');
        doc.text('Total:', 310, doc.y, { width: 80, align: 'right' });
        doc.text(`$${params.total.toFixed(2)}`, 400, doc.y, { width: 60, align: 'right' });
        doc.moveDown(1);

        // Payment method
        doc.font('Helvetica').fontSize(9).fillColor('#64748b');
        doc.text(`Payment Method: ${params.paymentMethod}`, 50, doc.y);
        doc.moveDown(1);

        // Footer
        doc.fontSize(8).font('Helvetica').fillColor('#94a3b8');
        doc.text('Thank you for your business!', { align: 'center' });
        doc.text('Code Vault — Digital Code Marketplace', { align: 'center' });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // ─── Existing email methods ───

  async sendCodeEmail(
    to: string,
    merchantName: string,
    productName: string,
    codes: { denomination: string; code: string }[],
    fulfillmentId: string,
  ): Promise<boolean> {
    const codeRows = codes
      .map(
        (c, i) =>
          `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${i + 1}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;">${c.denomination}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:14px;background:#f9fafb;border-radius:4px;">${c.code}</td></tr>`,
      )
      .join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#0f172a;color:#fff;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;font-size:22px;">Code Vault — Product Codes</h1>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
          <p style="color:#374151;font-size:15px;">Hi ${merchantName},</p>
          <p style="color:#374151;font-size:15px;">
            Your order for <strong>${productName}</strong> has been fulfilled. Below are your product codes:
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">#</th>
                <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Denomination</th>
                <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Code</th>
              </tr>
            </thead>
            <tbody>
              ${codeRows}
            </tbody>
          </table>
          <p style="color:#6b7280;font-size:13px;margin-top:24px;">
            Fulfillment ID: <span style="font-family:monospace;">${fulfillmentId}</span><br/>
            Please store these codes safely. This email was sent from Code Vault.
          </p>
        </div>
      </div>
    `;

    const text = `Your ${productName} codes — Code Vault\n\nHi ${merchantName},\n\nYour order for ${productName} has been fulfilled. Fulfillment ID: ${fulfillmentId}\n\nPlease store these codes safely.`;

    return this.sendEmail(to, `Your ${productName} codes — Code Vault`, html, { text });
  }

  /**
   * Sends a reveal code email directly to the customer.
   * The link is permanent — it never expires.
   */
  async sendRevealCodeEmail(
    to: string,
    customerName: string,
    productName: string,
    revealLink: string,
    fulfillmentId: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#0f172a;color:#fff;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;font-size:22px;">Your Digital Code is Ready</h1>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
          <p style="color:#374151;font-size:15px;">Hello ${customerName},</p>
          <p style="color:#374151;font-size:15px;">
            Thank you for your purchase.
          </p>
          <p style="color:#374151;font-size:15px;">
            Your digital code has been securely stored.
          </p>
          <p style="color:#374151;font-size:15px;">
            To reveal your code, click the button below.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${revealLink}" style="display:inline-block;background:#6366f1;color:#fff;font-weight:600;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;">Reveal My Code</a>
          </div>
          <p style="color:#6b7280;font-size:13px;">
            This link allows you to securely view your code.
          </p>
          <p style="color:#6b7280;font-size:13px;margin-top:24px;">
            Fulfillment ID: <span style="font-family:monospace;">${fulfillmentId}</span><br/>
            If the button doesn't work, copy and paste this link into your browser:<br/>
            <span style="font-family:monospace;font-size:12px;color:#6366f1;">${revealLink}</span>
          </p>
          <p style="color:#6b7280;font-size:13px;margin-top:24px;">
            Thank you,<br/>
            CodeHub
          </p>
        </div>
      </div>
    `;

    const text = `Your Digital Code is Ready\n\nHello ${customerName},\n\nThank you for your purchase.\nYour digital code has been securely stored.\n\nTo reveal your code, click: ${revealLink}\n\nFulfillment ID: ${fulfillmentId}`;

    return this.sendEmail(to, 'Your Digital Code is Ready', html, { text });
  }

  /**
   * Sends an order received email to the customer BEFORE payment confirmation.
   */
  async sendOrderReceivedEmail(
    to: string,
    customerName: string,
    orderId: string,
    orderDate: string,
    product: string,
    totalPayment: string,
    paymentMethods: string[],
    bankDetails: Array<{ bank: string; accountNumber: string; iban: string }>,
    easyPaisa?: { title: string; number: string },
  ): Promise<boolean> {
    const paymentMethodRows = paymentMethods.map((m) => `<li style="margin:4px 0;">${m}</li>`).join('');
    const bankRows = bankDetails
      .map(
        (b) => `
        <div style="margin:12px 0;">
          <p style="margin:4px 0;font-weight:600;">${b.bank}</p>
          <p style="margin:2px 0;font-size:13px;">Account Number: ${b.accountNumber}</p>
          <p style="margin:2px 0;font-size:13px;">IBAN: ${b.iban}</p>
        </div>
      `,
      )
      .join('');

    const easyPaisaSection = easyPaisa
      ? `<div style="margin:12px 0;">
        <p style="margin:4px 0;font-weight:600;">EasyPaisa / NayaPay</p>
        <p style="margin:2px 0;font-size:13px;">Account Title: ${easyPaisa.title}</p>
        <p style="margin:2px 0;font-size:13px;">Account Number: ${easyPaisa.number}</p>
      </div>`
      : '';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;">
        <div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <div style="background:#0f172a;color:#fff;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:22px;">Code Vault</h1>
            <p style="margin:4px 0;font-size:13px;opacity:0.8;">Digital Code Marketplace</p>
          </div>
          <div style="padding:24px;">
            <h2 style="color:#0f172a;margin:0 0 16px;font-size:20px;">Order #${orderId} Received — Awaiting Payment</h2>
            <p style="color:#374151;font-size:15px;">Hello from Code Vault!</p>
            <p style="color:#374151;font-size:15px;margin-top:12px;">
              Thank you for your order #${orderId}.
            </p>
            <p style="color:#374151;font-size:15px;">
              Your order has been received and is currently awaiting payment confirmation.
            </p>

            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
              <h3 style="margin:0 0 12px;font-size:16px;color:#0f172a;">Order Details</h3>
              <p style="margin:4px 0;font-size:13px;"><span style="color:#6b7280;">Product:</span> <strong>${product}</strong></p>
              <p style="margin:4px 0;font-size:13px;"><span style="color:#6b7280;">Order Date:</span> ${orderDate}</p>
              <p style="margin:4px 0;font-size:13px;"><span style="color:#6b7280;">Total Payment:</span> <strong>${totalPayment}</strong></p>
            </div>

            <h3 style="margin:20px 0 12px;font-size:16px;color:#0f172a;">Payment Method</h3>
            <ul style="color:#374151;font-size:14px;padding-left:20px;">
              ${paymentMethodRows}
            </ul>

            <h3 style="margin:20px 0 12px;font-size:16px;color:#0f172a;">Bank Details</h3>
            ${bankRows}
            ${easyPaisaSection}

            <div style="background:#eff6ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:20px 0;">
              <p style="margin:0;font-size:13px;color:#0369a1;">
                <strong>⚠️ Please reply to this email with your payment screenshot</strong> so we can verify your payment as quickly as possible.
              </p>
            </div>
          </div>
          <div style="background:#f1f5f9;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#64748b;">
              Code Vault — Digital Code Marketplace<br/>
              noreply@digitalcode.local
            </p>
          </div>
        </div>
      </div>
    `;

    const text = `Order #${orderId} Received - Awaiting Payment\n\nHello from Code Vault!\n\nThank you for your order #${orderId}.\nYour order has been received and is currently awaiting payment confirmation.\n\nProduct: ${product}\nOrder Date: ${orderDate}\nTotal Payment: ${totalPayment}\n\nPlease reply to this email with your payment screenshot so we can verify your payment as quickly as possible.`;

    return this.sendEmail(to, `Order #${orderId} Received - Awaiting Payment`, html, { text });
  }

  /**
   * Sends a payment confirmation email to the customer after payment is verified.
   * Includes a PDF invoice attachment.
   */
  async sendPaymentConfirmationEmail(
    to: string,
    customerName: string,
    orderId: string,
    orderDate: string,
    product: string,
    quantity: number,
    price: number,
    subtotal: number,
    tax: number,
    total: number,
    paymentMethod: string,
    billingAddress?: string,
    invoiceBuffer?: Buffer,
    revealLink?: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;">
        <div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <div style="background:#0f172a;color:#fff;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:22px;">Code Vault</h1>
          </div>
          <div style="padding:24px;">
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-block;background:#dcfce7;border:1px solid #86efac;border-radius:50%;width:60px;height:60px;line-height:60px;font-size:24px;">✓</div>
            </div>
            <h2 style="color:#0f172a;margin:0 0 16px;font-size:20px;text-align:center;">Thank You for Your Order!</h2>
            <p style="color:#374151;font-size:15px;text-align:center;">
              Your payment has been confirmed and your order is being processed.
            </p>

            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
              <h3 style="margin:0 0 12px;font-size:16px;color:#0f172a;">Order Summary</h3>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Order Number</td><td style="padding:6px 0;font-size:13px;font-family:monospace;">${orderId}</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Order Date</td><td style="padding:6px 0;font-size:13px;">${orderDate}</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Product</td><td style="padding:6px 0;font-size:13px;">${product}</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Quantity</td><td style="padding:6px 0;font-size:13px;">${quantity}</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Price</td><td style="padding:6px 0;font-size:13px;">$${price.toFixed(2)}</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Subtotal</td><td style="padding:6px 0;font-size:13px;">$${subtotal.toFixed(2)}</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Tax</td><td style="padding:6px 0;font-size:13px;">$${tax.toFixed(2)}</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Payment Method</td><td style="padding:6px 0;font-size:13px;">${paymentMethod}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;font-weight:600;color:#0f172a;">Total</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#0f172a;">$${total.toFixed(2)}</td></tr>
              </table>
            </div>

            ${billingAddress ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;"><h3 style="margin:0 0 8px;font-size:16px;color:#0f172a;">Billing Address</h3><p style="margin:0;font-size:13px;color:#374151;">${billingAddress}</p></div>` : ''}

            <p style="color:#374151;font-size:15px;">
              A PDF invoice has been attached to this email for your records.
            </p>

            ${revealLink ? `<div style="text-align:center;margin:24px 0;"><a href="${revealLink}" style="display:inline-block;background:#6366f1;color:#fff;font-weight:600;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;">Reveal My Code</a></div>` : ''}
          </div>
          <div style="background:#1e293b;padding:16px;text-align:center;">
            <div style="display:flex;justify-content:center;gap:16px;margin-bottom:8px;">
              <a href="#" style="color:#94a3b8;text-decoration:none;">🌐</a>
              <a href="#" style="color:#94a3b8;text-decoration:none;">📧</a>
              <a href="#" style="color:#94a3b8;text-decoration:none;">📱</a>
            </div>
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              Code Vault — Digital Code Marketplace<br/>
              noreply@digitalcode.local
            </p>
          </div>
        </div>
      </div>
    `;

    const text = `Payment Confirmation — Order #${orderId}\n\nHello ${customerName},\n\nYour payment has been confirmed and your order is being processed.\n\nOrder Details:\nOrder Number: ${orderId}\nOrder Date: ${orderDate}\nProduct: ${product}\nQuantity: ${quantity}\nPrice: $${price.toFixed(2)}\nSubtotal: $${subtotal.toFixed(2)}\nTax: $${tax.toFixed(2)}\nTotal: $${total.toFixed(2)}\nPayment Method: ${paymentMethod}\n\nA PDF invoice has been attached to this email.`;

    const attachments = invoiceBuffer
      ? [{ filename: `invoice-${orderId}.pdf`, content: invoiceBuffer, contentType: 'application/pdf' }]
      : undefined;

    return this.sendEmail(to, `Payment Confirmed — Order #${orderId}`, html, { text, attachments });
  }

  /**
   * Sends a purchase notification email to the merchant when a customer
   * successfully purchases a digital code.
   */
  async sendMerchantPurchaseNotification(
    to: string,
    merchantName: string,
    customerName: string,
    customerEmail: string,
    productName: string,
    orderId: string,
    purchaseDate: string,
    orderStatus: string,
    productRegion?: string,
  ): Promise<boolean> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#0f172a;color:#fff;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;font-size:22px;">New Digital Code Purchase</h1>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
          <p style="color:#374151;font-size:15px;">Hello ${merchantName},</p>
          <p style="color:#374151;font-size:15px;">
            A customer has successfully purchased one of your digital products.
          </p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="font-size:13px;color:#6b7280;margin:4px 0;">
              <span style="font-weight:600;color:#111827;">Order ID:</span>
              <span style="font-family:monospace;">${orderId}</span>
            </p>
            <p style="font-size:13px;color:#6b7280;margin:4px 0;">
              <span style="font-weight:600;color:#111827;">Product:</span>
              <span>${productName}${productRegion ? ` (${productRegion})` : ''}</span>
            </p>
            <p style="font-size:13px;color:#6b7280;margin:4px 0;">
              <span style="font-weight:600;color:#111827;">Customer:</span>
              <span>${customerName}</span>
            </p>
            <p style="font-size:13px;color:#6b7280;margin:4px 0;">
              <span style="font-weight:600;color:#111827;">Customer Email:</span>
              <span>${customerEmail}</span>
            </p>
            <p style="font-size:13px;color:#6b7280;margin:4px 0;">
              <span style="font-weight:600;color:#111827;">Purchase Date:</span>
              <span>${new Date(purchaseDate).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </p>
            <p style="font-size:13px;color:#6b7280;margin:4px 0;">
              <span style="font-weight:600;color:#111827;">Status:</span>
              <span>${orderStatus}</span>
            </p>
          </div>
          <p style="color:#374151;font-size:15px;">
            The digital code has been successfully assigned and delivered to the customer through CodeHub.
          </p>
          <p style="color:#6b7280;font-size:13px;margin-top:24px;">
            Thank you,<br/>
            CodeHub
          </p>
        </div>
      </div>
    `;

    const text = `New Digital Code Purchase\n\nHello ${merchantName},\n\nA customer has successfully purchased one of your digital products.\n\nOrder ID: ${orderId}\nProduct: ${productName}${productRegion ? ` (${productRegion})` : ''}\nCustomer: ${customerName}\nCustomer Email: ${customerEmail}\nPurchase Date: ${purchaseDate}\nStatus: ${orderStatus}\n\nThe digital code has been successfully assigned and delivered to the customer through CodeHub.`;

    return this.sendEmail(to, 'New Digital Code Purchase', html, { text });
  }

  /**
   * Sends a delivery link email to the merchant (backward compatibility).
   * The expiryMinutes parameter is now optional since links are permanent.
   */
  async sendDeliveryLinkEmail(
    to: string,
    merchantName: string,
    productName: string,
    deliveryLink: string,
    fulfillmentId: string,
    expiryMinutes?: number,
  ): Promise<boolean> {
    const expiryWarning = expiryMinutes
      ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin:16px 0;">
            <p style="color:#92400e;font-size:13px;margin:0;">
              <strong>⚠️ This link expires in ${expiryMinutes} minutes.</strong> Click it soon to reveal your codes.
            </p>
          </div>`
      : '';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#0f172a;color:#fff;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;font-size:22px;">Code Vault — Order Ready</h1>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
          <p style="color:#374151;font-size:15px;">Hi ${merchantName},</p>
          <p style="color:#374151;font-size:15px;">
            Your order for <strong>${productName}</strong> has been fulfilled and your product codes are ready.
          </p>
          <p style="color:#374151;font-size:15px;">
            Click the button below to reveal your codes:
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${deliveryLink}" style="display:inline-block;background:#6366f1;color:#fff;font-weight:600;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;">Reveal My Codes</a>
          </div>
          ${expiryWarning}
          <p style="color:#6b7280;font-size:13px;margin-top:24px;">
            Fulfillment ID: <span style="font-family:monospace;">${fulfillmentId}</span><br/>
            If the button doesn't work, copy and paste this link into your browser:<br/>
            <span style="font-family:monospace;font-size:12px;color:#6366f1;">${deliveryLink}</span>
          </p>
        </div>
      </div>
    `;

    const text = `Your ${productName} codes are ready — Code Vault\n\nHi ${merchantName},\n\nYour order for ${productName} has been fulfilled and your product codes are ready.\n\nFulfillment ID: ${fulfillmentId}\nDelivery Link: ${deliveryLink}`;

    return this.sendEmail(to, `Your ${productName} codes are ready — Code Vault`, html, { text });
  }

  /**
   * Sends a verification code email for customer login
   */
  async sendVerificationCodeEmail(to: string, customerName: string, code: string): Promise<boolean> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#0f172a;color:#fff;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;font-size:22px;">Your Verification Code</h1>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
          <p style="color:#374151;font-size:15px;">Hello ${customerName},</p>
          <p style="color:#374151;font-size:15px;">
            Your verification code is:
          </p>
          <div style="background:#f3f4f6;border:2px solid #6366f1;border-radius:8px;padding:16px;margin:24px 0;text-align:center;">
            <span style="font-size:32px;font-weight:600;font-family:monospace;letter-spacing:4px;color:#0f172a;">${code}</span>
          </div>
          <p style="color:#6b7280;font-size:13px;">
            This code will expire in 10 minutes. Please do not share this code with anyone.
          </p>
          <p style="color:#6b7280;font-size:13px;margin-top:24px;">
            If you didn't request this code, please ignore this email.
          </p>
        </div>
      </div>
    `;

    const text = `Your Verification Code\n\nHello ${customerName},\n\nYour verification code is: ${code}\n\nThis code will expire in 10 minutes. Please do not share this code with anyone.\n\nIf you didn't request this code, please ignore this email.`;

    return this.sendEmail(to, 'Your Verification Code', html, { text });
  }

  /**
   * Sends a delivery ready email when the customer opens the delivery page.
   * Triggered by the delivery flow (GET /reveal/:token), NOT by webhooks.
   * Dark theme, responsive, mobile-friendly.
   */
  async sendDeliveryReadyEmail(
    to: string,
    customerName: string,
    orderId: string,
    productName: string,
    amount: string,
    deliveryLink: string,
  ): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Digital Code is Ready</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e2e8f0;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
      <div style="background:#0f172a;padding:24px;text-align:center;border-bottom:1px solid #334155;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#6366f1;border-radius:12px;font-size:28px;margin-bottom:16px;">🔐</div>
        <h1 style="margin:0;font-size:22px;color:#fff;">Your Digital Code is Ready</h1>
      </div>
      <div style="padding:32px 24px;">
        <p style="color:#e2e8f0;font-size:15px;margin:0 0 16px;">Hello ${customerName},</p>
        <p style="color:#94a3b8;font-size:15px;margin:0 0 24px;">Your order has been processed successfully.</p>
        <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;margin:0 0 24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#64748b;width:120px;">Order ID</td>
              <td style="padding:8px 0;font-size:14px;color:#e2e8f0;font-family:monospace;">${orderId}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#64748b;">Product</td>
              <td style="padding:8px 0;font-size:14px;color:#e2e8f0;font-weight:600;">${productName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#64748b;">Amount</td>
              <td style="padding:8px 0;font-size:14px;color:#e2e8f0;font-weight:600;">${amount}</td>
            </tr>
          </table>
        </div>
        <p style="color:#94a3b8;font-size:14px;margin:0 0 16px;">Click below to access your secure delivery page:</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${deliveryLink}" style="display:inline-block;background:#6366f1;color:#fff;font-weight:600;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">Access My Delivery Page</a>
        </div>
        <div style="background:#1e3a8a;border:1px solid #3b82f6;border-radius:8px;padding:12px 16px;margin:24px 0;">
          <p style="color:#93c5fd;font-size:13px;margin:0;">🔗 This delivery link is permanent and can be used again if needed.</p>
        </div>
        <p style="color:#64748b;font-size:13px;margin:24px 0 0;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="color:#6366f1;font-size:12px;font-family:monospace;word-break:break-all;margin:8px 0 0;">${deliveryLink}</p>
      </div>
      <div style="background:#0f172a;padding:16px 24px;text-align:center;border-top:1px solid #334155;">
        <p style="color:#64748b;font-size:12px;margin:0;">Thank you for your purchase.<br/>CodeHub — Delivered securely</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    const text = `Your Digital Code is Ready\n\nHello ${customerName},\n\nYour order has been processed successfully.\n\nOrder ID: ${orderId}\nProduct: ${productName}\nAmount: ${amount}\n\nClick below to access your secure delivery page:\n${deliveryLink}\n\nThis delivery link is permanent and can be used again if needed.\n\nThank you for your purchase.\nCodeHub — Delivered securely`;

    return this.sendEmail(to, 'Your Digital Code is Ready', html, { text, template: 'delivery_ready' });
  }
}
