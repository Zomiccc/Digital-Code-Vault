import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', PKR: '\u20a8', SAR: '\ufdfc', TRY: '\u20ba', AED: '\u062f.\u0625',
  GBP: '\u00a3', EUR: '\u20ac', CAD: 'CA$', AUD: 'A$', INR: '\u20b9',
  QAR: '\u0631.\u0642', HKD: 'HK$',
};

/**
 * Format money in the currency it is actually in. The delivery email used to
 * print a dollar sign in front of every figure, so a riyal or lira price was
 * shown to the customer as dollars.
 */
function money(amount: unknown, currency?: string | null): string {
  const code = (currency || 'USD').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code];
  const value = Number(amount);
  const shown = (Number.isFinite(value) ? value : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return symbol ? `${symbol}${shown}` : `${code} ${shown}`;
}

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
          <td style="padding:18px 24px;border-top:1px solid #eef2f7;">
            <div style="color:#0f172a;font-size:16px;font-weight:600;line-height:1.35;">${this.esc(item.productName)}</div>
            <div style="color:#64748b;font-size:13px;padding-top:4px;">
              ${item.codesDelivered} code${item.codesDelivered === 1 ? '' : 's'}
              &nbsp;·&nbsp; ${money(item.amount, item.currency)}
            </div>
            <div style="color:#94a3b8;font-size:11px;padding-top:2px;">Order ${this.esc(item.fulfillmentId.slice(0, 8))}</div>
          </td>
          <td style="padding:18px 24px;border-top:1px solid #eef2f7;text-align:right;vertical-align:middle;white-space:nowrap;">
            <a href="${this.esc(item.deliveryLink)}"
               style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;">
              View code${item.codesDelivered === 1 ? '' : 's'}
            </a>
          </td>
        </tr>`).join('');

      // Summing across currencies would produce a meaningless figure, so each
      // currency is totalled on its own line.
      const totalsByCurrency = new Map<string, number>();
      for (const item of bucket.items) {
        const code = (item.currency || 'USD').toUpperCase();
        totalsByCurrency.set(code, (totalsByCurrency.get(code) ?? 0) + Number(item.amount));
      }
      const totalRows = [...totalsByCurrency.entries()]
        .map(([code, sum]) => `
        <tr>
          <td style="padding:4px 24px;color:#475569;font-size:14px;">Total</td>
          <td style="padding:4px 24px;text-align:right;color:#0f172a;font-size:18px;font-weight:700;">${money(sum, code)}</td>
        </tr>`).join('');
      const subject = bucket.items.length === 1
        ? 'Your Digital Code is Ready'
        : `Your ${bucket.items.length} Digital Codes are Ready`;

      const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0f172a;padding:30px 24px;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;line-height:1.3;">Hi ${this.esc(bucket.customerName)}, your codes are ready</h1>
      <p style="margin:10px 0 0;color:#94a3b8;font-size:14px;line-height:1.6;">
        ${bucket.items.length === 1 ? 'Your order is below.' : `All ${bucket.items.length} items are below.`}
        Tap to reveal each code — the link keeps working, so you can come back to it.
      </p>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${rows}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border-top:1px solid #eef2f7;padding:8px 0;">
      <tr><td style="height:12px;"></td></tr>
      ${totalRows}
      <tr><td style="height:12px;"></td></tr>
    </table>
    <div style="padding:22px 24px 26px;color:#94a3b8;font-size:12px;line-height:1.7;border-top:1px solid #eef2f7;">
      Your links never expire — come back to this email any time to see your codes again.<br/>
      Need help? Just reply to this message.
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
