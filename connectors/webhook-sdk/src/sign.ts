import { createHmac } from 'node:crypto';

/**
 * Scheme A — outbound request signing helpers (connector -> platform).
 * See SIGNING.md. The server (`ApiKeyGuard` + `AuthService.verifyHmacSignature`) computes:
 *
 *   data = `${METHOD.toUpperCase()}\n${path}\n${body}\n${timestamp}`
 *   signature = HMAC_SHA256(secret, data)  // hex
 *
 * where `secret` is the API key itself, `path` is `req.originalUrl` (includes the
 * `/api/v1` global prefix), and `body` is `req.rawBody?.toString() ?? ''`.
 *
 * The API never enables raw-body capture, so `body` is ALWAYS the empty string on the
 * server side — we must sign over `''` regardless of the JSON payload we transmit.
 */

/** The body value the server actually signs over (always empty — see SIGNING.md). */
export const SERVER_SIGNED_BODY = '';

export interface CanonicalParams {
  method: string;
  /** Path as the server sees it in `req.originalUrl`, e.g. `/api/v1/webhooks/endpoints`. */
  path: string;
  /** Body the server signs over. Defaults to `''` to match stock server behavior. */
  body?: string;
  /** Epoch-millisecond timestamp string (same value sent in `X-Timestamp`). */
  timestamp: string;
}

export function buildCanonicalString(params: CanonicalParams): string {
  const { method, path, timestamp } = params;
  const body = params.body ?? SERVER_SIGNED_BODY;
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
