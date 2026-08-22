import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

export interface DigestItem {
  productName: string;
  fulfillmentId: string;
  referenceId?: string;
  amount: number;
  currency: string;
  codesDelivered: number;
  deliveryLink: string;
}

interface DigestBucket {
  customerName: string;
  merchantName?: string;
  items: DigestItem[];
  timer: ReturnType<typeof setTimeout>;
  firstEnqueuedAt: Date;
}

/**
 * Consolidates post-purchase emails per customer.
 *
 * When a shopper checks out several items in one session (or clicks through a few
 * orders quickly), they get ONE "Your Digital Codes are Ready" email containing
 * every item and its personal reveal link, instead of an email per order.
 *
 * Items are buffered for EMAIL_DIGEST_WINDOW_SECONDS (default 90s) from the first
 * item; the window is not extended by later items so delivery is never delayed long.
 */
@Injectable()
export class OrderDigestService implements OnModuleDestroy {
  private readonly logger = new Logger(OrderDigestService.name);
  private readonly buckets = new Map<string, DigestBucket>();
  private readonly windowMs: number;
  private flushing = false;

  constructor(
    private emailService: EmailService,
    private configService: ConfigService,
  ) {
    const seconds = this.configService.get<number>('EMAIL_DIGEST_WINDOW_SECONDS', 90);
    this.windowMs = Math.max(5, seconds) * 1000;
  }

  enqueue(customerEmail: string, item: DigestItem, opts?: { customerName?: string; merchantName?: string }) {
    if (!customerEmail) return;
    const key = customerEmail.trim().toLowerCase();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        customerName: opts?.customerName || customerEmail,
        merchantName: opts?.merchantName,
        items: [],
        firstEnqueuedAt: new Date(),
        timer: setTimeout(() => void this.flush(key).catch(() => {}), this.windowMs),
      };
      // Never keep the event loop alive just for a pending digest
      bucket.timer.unref?.();
      this.buckets.set(key, bucket);
      this.logger.log(`Digest opened for ${key} (window ${this.windowMs / 1000}s)`);
    } else {
      if (opts?.customerName && bucket.customerName === key) bucket.customerName = opts.customerName;
    }

    bucket.items.push(item);
    this.logger.log(`Digest for ${key} now holds ${bucket.items.length} item(s): +${item.productName}`);
  }

  private async flush(key: string) {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.items.length === 0) return;
    if (this.flushing) {
      // Retry shortly if a shutdown flush is already running
      setTimeout(() => void this.flush(key).catch(() => {}), 2000);
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
    } finally {
      this.flushing = false;
    }
  }

  /** Flush everything immediately (graceful shutdown / testing). */
  async flushAll() {
    const keys = [...this.buckets.keys()];
    await Promise.all(keys.map((k) => this.flush(k)));
  }

  onModuleDestroy() {
    // Best-effort synchronous-ish flush so pending digests aren't lost on restart
    void this.flushAll();
  }

  private esc(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}
