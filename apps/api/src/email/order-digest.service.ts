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

      // Each item is its own full-width row: the product and its button stack on
      // a narrow screen instead of being squeezed into two columns.
      const rows = bucket.items.map((item) => `
        <tr>
          <td style="padding:22px 28px;border-top:1px solid #e8eef5;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#0f172a;font-size:17px;font-weight:600;line-height:1.35;padding-bottom:6px;">
                  ${this.esc(item.productName)}
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:14px;">
                  <span style="display:inline-block;background:#eef4ff;color:#2151b9;font-size:12px;font-weight:600;padding:3px 9px;border-radius:20px;">
                    ${item.codesDelivered} code${item.codesDelivered === 1 ? '' : 's'}
                  </span>
                  <span style="color:#475569;font-size:13px;padding-left:8px;">${money(item.amount, item.currency)}</span>
                  <span style="color:#a3b1c2;font-size:11px;padding-left:8px;">#${this.esc(item.fulfillmentId.slice(0, 8))}</span>
                </td>
              </tr>
              <tr>
                <td>
                  <a href="${this.esc(item.deliveryLink)}"
                     style="background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:9px;font-weight:600;font-size:15px;display:inline-block;">
                    Reveal ${item.codesDelivered === 1 ? 'code' : 'codes'}
                  </a>
                </td>
              </tr>
            </table>
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
          <td style="padding:16px 0 0;color:#5b6b80;font-size:13px;font-weight:600;letter-spacing:0.3px;text-transform:uppercase;">
            Total${totalsByCurrency.size > 1 ? ` (${code})` : ''}
          </td>
          <td style="padding:16px 0 0;text-align:right;color:#0f172a;font-size:22px;font-weight:700;">${money(sum, code)}</td>
        </tr>`).join('');
      const subject = bucket.items.length === 1
        ? 'Your Digital Code is Ready'
        : `Your ${bucket.items.length} Digital Codes are Ready`;

      const html = `
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!-- Preheader: what inboxes show next to the subject line. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${bucket.items.length === 1 ? 'Your code is ready to reveal.' : `All ${bucket.items.length} of your codes are ready to reveal.`}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">

          <tr>
            <td style="background:#0f172a;padding:32px 28px;">
              <div style="color:#7dd3a8;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">Digital Code Vault</div>
              <h1 style="margin:12px 0 0;color:#ffffff;font-size:23px;line-height:1.3;font-weight:600;">
                ${this.esc(bucket.customerName)}, your ${bucket.items.length === 1 ? 'code is' : 'codes are'} ready
              </h1>
              <p style="margin:10px 0 0;color:#9fb0c6;font-size:14px;line-height:1.6;">
                Tap to reveal. Your link never expires, so you can come back to this email whenever
                you need ${bucket.items.length === 1 ? 'it' : 'them'} again.
              </p>
            </td>
          </tr>

          ${rows}

          <tr>
            <td style="padding:0 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #0f172a;">
                ${totalRows}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 28px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fc;border-radius:10px;">
                <tr>
                  <td style="padding:16px 18px;color:#5b6b80;font-size:12px;line-height:1.7;">
                    <strong style="color:#334155;">Redeeming</strong><br/>
                    Open your provider's app or website and enter the code there. Use each code with
                    the product and region it was bought for.
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;color:#94a3b8;font-size:12px;line-height:1.7;">
                Need help? Just reply to this message and we will pick it up.
              </p>
            </td>
          </tr>

        </table>
        <p style="margin:18px 0 0;color:#9aa8ba;font-size:11px;">This email was sent because you completed a purchase.</p>
      </td>
    </tr>
  </table>
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
