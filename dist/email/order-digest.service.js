"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OrderDigestService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderDigestService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const email_service_1 = require("./email.service");
let OrderDigestService = OrderDigestService_1 = class OrderDigestService {
    emailService;
    configService;
    logger = new common_1.Logger(OrderDigestService_1.name);
    buckets = new Map();
    windowMs;
    flushing = false;
    constructor(emailService, configService) {
        this.emailService = emailService;
        this.configService = configService;
        const seconds = this.configService.get('EMAIL_DIGEST_WINDOW_SECONDS', 90);
        this.windowMs = Math.max(5, seconds) * 1000;
    }
    enqueue(customerEmail, item, opts) {
        if (!customerEmail)
            return;
        const key = customerEmail.trim().toLowerCase();
        let bucket = this.buckets.get(key);
        if (!bucket) {
            bucket = {
                customerName: opts?.customerName || customerEmail,
                merchantName: opts?.merchantName,
                items: [],
                firstEnqueuedAt: new Date(),
                timer: setTimeout(() => void this.flush(key).catch(() => { }), this.windowMs),
            };
            bucket.timer.unref?.();
            this.buckets.set(key, bucket);
            this.logger.log(`Digest opened for ${key} (window ${this.windowMs / 1000}s)`);
        }
        else {
            if (opts?.customerName && bucket.customerName === key)
                bucket.customerName = opts.customerName;
        }
        bucket.items.push(item);
        this.logger.log(`Digest for ${key} now holds ${bucket.items.length} item(s): +${item.productName}`);
    }
    async flush(key) {
        const bucket = this.buckets.get(key);
        if (!bucket || bucket.items.length === 0)
            return;
        if (this.flushing) {
            setTimeout(() => void this.flush(key).catch(() => { }), 2000);
            return;
        }
        this.flushing = true;
        try {
            this.buckets.delete(key);
            clearTimeout(bucket.timer);
            const rows = bucket.items.map((item) => `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;">
            <strong style="color:#0f172a;">${this.esc(item.productName)}</strong><br/>
            <span style="color:#64748b;font-size:12px;">${item.codesDelivered} code${item.codesDelivered === 1 ? '' : 's'} · order ${this.esc(item.fulfillmentId.slice(0, 8))}</span>
          </td>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#0f172a;">
            $${Number(item.amount).toFixed(2)}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;">
            <a href="${this.esc(item.deliveryLink)}"
               style="background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block;">
              View Code${item.codesDelivered === 1 ? '' : 's'}
            </a>
          </td>
        </tr>`).join('');
            const total = bucket.items.reduce((sum, i) => sum + Number(i.amount), 0);
            const subject = bucket.items.length === 1
                ? 'Your Digital Code is Ready'
                : `Your ${bucket.items.length} Digital Codes are Ready`;
            const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0f172a;padding:28px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;">Hi ${this.esc(bucket.customerName)}, your codes are ready!</h1>
      <p style="margin:8px 0 0;color:#94a3b8;font-size:14px;">Everything you ordered is below — tap "View" to reveal each code. Links are permanent.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${rows}
    </table>
    <div style="padding:20px 32px;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;">
      <span style="color:#475569;font-weight:600;">Total</span>
      <span style="color:#0f172a;font-weight:700;font-size:18px;">$${total.toFixed(2)}</span>
    </div>
    <div style="padding:20px 32px 28px;color:#94a3b8;font-size:12px;line-height:1.6;">
      Keep these links — they never expire and can be viewed anytime.<br/>
      Need help? Just reply to this email.
    </div>
  </div>
</body>
</html>`;
            const ok = await this.emailService.sendEmail(key, subject, html, {
                template: 'order-digest',
            });
            this.logger.log(`Digest email to ${key}: ${ok ? 'SENT' : 'FAILED'} (${bucket.items.length} item(s))`);
        }
        finally {
            this.flushing = false;
        }
    }
    async flushAll() {
        const keys = [...this.buckets.keys()];
        await Promise.all(keys.map((k) => this.flush(k)));
    }
    onModuleDestroy() {
        void this.flushAll();
    }
    esc(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
};
exports.OrderDigestService = OrderDigestService;
exports.OrderDigestService = OrderDigestService = OrderDigestService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [email_service_1.EmailService,
        config_1.ConfigService])
], OrderDigestService);
//# sourceMappingURL=order-digest.service.js.map