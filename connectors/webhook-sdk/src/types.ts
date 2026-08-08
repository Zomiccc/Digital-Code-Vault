/**
 * Shared types for the Digital Code Vault webhook SDK.
 *
 * There are two independent HMAC-SHA256 (hex) schemes — see SIGNING.md:
 *  - Scheme A: outbound request signing (this connector -> platform), used by
 *    {@link RegisterWebhookOptions}. HMAC key = the API key itself.
 *  - Scheme B: inbound delivery verification (platform -> this connector), used by
 *    the verify helpers. HMAC key = the endpoint `secret` returned at registration.
 */

/** Minimal `fetch` shape so the SDK works on Node 18+ (global fetch) or a custom impl. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  status: number;
  text: () => Promise<string>;
}>;

/** Structured log record emitted for every registration attempt / verification failure. */
export interface ConnectorLog {
  timestamp: string;
  step: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

/** A logger the caller can supply. Defaults to `console`-based structured logging. */
export type Logger = (log: ConnectorLog) => void;

export interface RegisterWebhookOptions {
  /**
   * The merchant API key string (e.g. `pk_....`) generated in the admin/merchant portal.
   * This single value is sent as `X-Api-Key` AND used as the HMAC key for request signing.
   * There is no separate "API secret" in this backend — see SIGNING.md.
   */
  apiKey: string;
  /** The publicly reachable URL the platform should deliver events to. */
  url: string;
  /**
   * When true, the server skips its challenge-response reachability check and registers
   * the endpoint anyway. Defaults to `false`.
   */
  skipVerification?: boolean;
  /**
   * API base including the global prefix. Defaults to `http://localhost:3000/api/v1`.
   * The signed PATH is derived from this (it must match `req.originalUrl` on the server,
   * which includes `/api/v1`).
   */
  baseUrl?: string;
  /**
   * Advanced/testing override for the HMAC key used to sign the request. Defaults to
   * `apiKey` (which is what the server expects). Only set this if a specific deployment
   * diverges from the stock `ApiKeyGuard` behavior.
   */
  hmacSecret?: string;
  /** Override the current time (epoch ms) — mainly for tests. */
  timestamp?: number;
  /** Custom fetch implementation (defaults to global `fetch`). */
  fetchImpl?: FetchLike;
  /** Optional structured logger. */
  logger?: Logger;
}

/** Shape returned by `WebhookService.registerEndpoint` on success. */
export interface RegisterWebhookResult {
  id: string;
  url: string;
  status: string;
  /** The endpoint secret — store this; it is the HMAC key for verifying deliveries. */
  secret: string;
}

export interface ApiErrorShape {
  error?: string;
  code?: string;
  message?: string;
}

/** Thrown when the API returns a non-2xx response to a signed request. */
export class WebhookApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly apiError?: string;
  readonly rawBody: string;

  constructor(status: number, rawBody: string, parsed?: ApiErrorShape) {
    super(parsed?.message || `Webhook API request failed with HTTP ${status}`);
    this.name = 'WebhookApiError';
    this.status = status;
    this.code = parsed?.code;
    this.apiError = parsed?.error;
    this.rawBody = rawBody;
  }
}

export interface ListEndpointsOptions {
  apiKey: string;
  baseUrl?: string;
  hmacSecret?: string;
  timestamp?: number;
  fetchImpl?: FetchLike;
  logger?: Logger;
}

export interface DeleteWebhookOptions {
  apiKey: string;
  /** The endpoint id returned at registration. */
  id: string;
  baseUrl?: string;
  hmacSecret?: string;
  timestamp?: number;
  fetchImpl?: FetchLike;
  logger?: Logger;
}
