import { createHmac } from 'node:crypto';

/**
 * Scheme A — outbound request signing helpers (connector -> platform).
 * See SIGNING.md. The server (`ApiKeyGuard` + `AuthService.verifyHmacSignature`) computes:
 *
 *   data = `${METHOD.toUpperCase()}\n${path}\n${body}\n${timestamp}`
 *   signature = HMAC_SHA256(secret, data)  // hex
 *
 * where `secret` is the API key itself, `path` is `req.originalUrl` (includes the
 * `/api/v1` global prefix), and `body` is the exact raw JSON string sent as the request
 * body (captured server-side via Nest's `rawBody: true` option). The body MUST be the
 * exact byte-for-byte string you transmit — do not re-stringify a parsed object, since
 * key ordering or whitespace differences will break signature verification.
 */

export interface CanonicalParams {
  method: string;
  /** Path as the server sees it in `req.originalUrl`, e.g. `/api/v1/webhooks/endpoints`. */
  path: string;
  /** Exact raw request body string (empty string for GET/DELETE with no body). */
  body?: string;
  /** Epoch-millisecond timestamp string (same value sent in `X-Timestamp`). */
  timestamp: string;
}

export function buildCanonicalString(params: CanonicalParams): string {
  const { method, path, timestamp } = params;
  const body = params.body ?? '';
  return `${method.toUpperCase()}\n${path}\n${body}\n${timestamp}`;
}

/**
 * Produces the `X-Signature` value for a signed API request.
 * `secret` is the API key (see SIGNING.md — the API key IS the HMAC key).
 */
export function signRequest(secret: string, params: CanonicalParams): string {
  const data = buildCanonicalString(params);
  return createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

/** Derives the signed PATH + full URL for an endpoint, from a base URL that includes `/api/v1`. */
export function resolveEndpoint(
  baseUrl: string,
  endpointSuffix: string,
): { url: string; path: string } {
  const trimmed = baseUrl.replace(/\/+$/, '');
  const suffix = endpointSuffix.startsWith('/') ? endpointSuffix : `/${endpointSuffix}`;
  const full = new URL(trimmed + suffix);
  return { url: full.href, path: full.pathname + full.search };
}
