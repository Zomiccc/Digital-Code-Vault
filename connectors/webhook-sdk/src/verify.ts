import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Logger } from './types.js';

/**
 * Scheme B — inbound delivery verification (platform -> connector).
 * See SIGNING.md. The platform's `deliverWebhook` computes:
 *
 *   signature = HMAC_SHA256(endpointSecret, rawBody)  // hex
 *
 * where `rawBody` is the exact JSON string sent in the HTTP body, and
 * `endpointSecret` is the `secret` returned from `registerWebhook`.
 *
 * **You must pass the raw request body** (the exact bytes received), not a
 * re-serialized object — `JSON.stringify` may reorder keys or change spacing.
 */

/**
 * Verifies an `X-Webhook-Signature` header against a raw request body.
 *
 * @param rawBody      The exact raw body bytes received (string or Buffer).
 * @param signatureHeader  The value of the `X-Webhook-Signature` header (hex).
 * @param endpointSecret   The endpoint `secret` returned at registration.
 * @returns `true` if the signature matches, `false` otherwise.
 */
export function verifyIncomingSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined | null,
  endpointSecret: string,
): boolean {
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = createHmac('sha256', endpointSecret).update(body, 'utf8').digest('hex');

  // Constant-time comparison to prevent timing attacks.
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHeader, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Express/Connect-style middleware that verifies `X-Webhook-Signature` on
 * incoming deliveries from the platform. Requires `req.rawBody` to be populated
 * (use `express.json({ verify: (req, buf) => { req.rawBody = buf; } })` or a
 * raw-body capture middleware before this).
 *
 * On success, attaches `req.webhookEvent` (from `X-Webhook-Event`) and calls `next()`.
 * On failure, responds 401 with a structured error and logs the failure.
 *
 * @param endpointSecret  The endpoint `secret` returned at registration.
 * @param logger          Optional structured logger for verification failures.
 */
export function verifyWebhookMiddleware(
  endpointSecret: string,
  logger?: Logger,
): (req: any, res: any, next: any) => void {
  const log: Logger =
    logger ||
    ((entry) => {
      // eslint-disable-next-line no-console
      console[entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'log'](
        `[webhook-sdk] ${entry.step}: ${entry.message}`,
        entry.details || '',
      );
    });

  return (req: any, res: any, next: any) => {
    const signature = req.headers['x-webhook-signature'];
    const event = req.headers['x-webhook-event'];
    const rawBody = req.rawBody;
    const ts = new Date().toISOString();

    if (!rawBody) {
      log({
        timestamp: ts,
        step: 'verifyWebhookMiddleware',
        level: 'error',
        message:
          'req.rawBody is not populated — install a raw-body capture middleware before this middleware.',
        details: { url: req.url, method: req.method },
      });
      res.status(500).json({
        error: 'SERVER_MISCONFIGURED',
        message: 'Raw body not available for signature verification.',
      });
      return;
    }

    const valid = verifyIncomingSignature(rawBody, signature, endpointSecret);

    if (!valid) {
      log({
        timestamp: ts,
        step: 'verifyWebhookMiddleware',
        level: 'warn',
        message: 'Signature verification failed — rejecting delivery.',
        details: {
          url: req.url,
          method: req.method,
          event,
          hasSignature: !!signature,
          bodyLength: typeof rawBody === 'string' ? rawBody.length : rawBody.byteLength,
        },
      });
      res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'X-Webhook-Signature verification failed.',
      });
      return;
    }

    req.webhookEvent = event;
    req.webhookVerified = true;
    next();
  };
}
