import { signRequest, resolveEndpoint } from './sign.js';
import {
  WebhookApiError,
  type RegisterWebhookOptions,
  type RegisterWebhookResult,
  type ListEndpointsOptions,
  type DeleteWebhookOptions,
  type Logger,
  type FetchLike,
  type ApiErrorShape,
} from './types.js';

const DEFAULT_BASE_URL = 'http://localhost:3000/api/v1';
const ENDPOINT_SUFFIX = '/webhooks/endpoints';

function defaultLogger(): Logger {
  return (entry) => {
    // eslint-disable-next-line no-console
    console[entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'log'](
      `[webhook-sdk] ${entry.step}: ${entry.message}`,
      entry.details || '',
    );
  };
}

function getFetch(opts: { fetchImpl?: FetchLike }): FetchLike {
  if (opts.fetchImpl) return opts.fetchImpl;
  if (typeof globalThis.fetch === 'function') return globalThis.fetch as FetchLike;
  throw new Error('No fetch implementation available. Pass `fetchImpl` or use Node 18+.');
}

function parseErrorBody(raw: string): ApiErrorShape | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function buildSignedHeaders(
  apiKey: string,
  method: string,
  path: string,
  timestampMs: number,
  hmacSecret: string,
  body: string = '',
): Record<string, string> {
  const ts = String(timestampMs);
  const signature = signRequest(hmacSecret, {
    method,
    path,
    body,
    timestamp: ts,
  });
  return {
    'X-Api-Key': apiKey,
    'X-Timestamp': ts,
    'X-Signature': signature,
  };
}

/**
 * Registers a webhook endpoint with the Digital Code Vault API.
 *
 * Sends a signed `POST /api/v1/webhooks/endpoints` request (Scheme A — see SIGNING.md).
 * The merchant must generate an API key from the admin/merchant portal first and pass it
 * as `apiKey`. This function does NOT create API keys.
 *
 * On success, returns `{ id, url, status, secret }`. **Store `secret`** — it is the HMAC
 * key for verifying inbound deliveries (Scheme B).
 *
 * @throws {WebhookApiError} on any non-2xx response, with `.status`, `.code`, `.rawBody`.
 */
export async function registerWebhook(opts: RegisterWebhookOptions): Promise<RegisterWebhookResult> {
  const apiKey = opts.apiKey;
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('registerWebhook: `apiKey` is required (generate one from the merchant portal).');
  }
  if (!opts.url || typeof opts.url !== 'string') {
    throw new Error('registerWebhook: `url` is required (the URL the platform should deliver to).');
  }

  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const hmacSecret = opts.hmacSecret || apiKey;
  const timestamp = opts.timestamp ?? Date.now();
  const logger = opts.logger || defaultLogger();
  const fetchImpl = getFetch(opts);

  const { url, path } = resolveEndpoint(baseUrl, ENDPOINT_SUFFIX);
  const body = JSON.stringify({ url: opts.url, skipVerification: opts.skipVerification ?? false });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildSignedHeaders(apiKey, 'POST', path, timestamp, hmacSecret, body),
  };

  logger({
    timestamp: new Date(timestamp).toISOString(),
    step: 'registerWebhook',
    level: 'info',
    message: 'Sending signed registration request.',
    details: { url, method: 'POST', signedPath: path, bodyLength: body.length },
  });

  let response;
  try {
    response = await fetchImpl(url, { method: 'POST', headers, body });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger({
      timestamp: new Date().toISOString(),
      step: 'registerWebhook',
      level: 'error',
      message: 'Network error while sending registration request.',
      details: { error: msg, url },
    });
    throw err;
  }

  const rawBody = await response.text();

  if (response.status < 200 || response.status >= 300) {
    const parsed = parseErrorBody(rawBody);
    const err = new WebhookApiError(response.status, rawBody, parsed);
    logger({
      timestamp: new Date().toISOString(),
      step: 'registerWebhook',
      level: 'error',
      message: err.message,
      details: { status: response.status, code: err.code, rawBody: rawBody.slice(0, 500) },
    });
    throw err;
  }

  const result = JSON.parse(rawBody) as RegisterWebhookResult;
  logger({
    timestamp: new Date().toISOString(),
    step: 'registerWebhook',
    level: 'info',
    message: 'Registration successful.',
    details: { id: result.id, status: result.status, url: result.url },
  });
  return result;
}

/**
 * Lists the merchant's registered webhook endpoints (signed `GET /webhooks/endpoints`).
 * Requires the `read` scope on the API key.
 */
export async function listWebhooks(opts: ListEndpointsOptions): Promise<RegisterWebhookResult[]> {
  const apiKey = opts.apiKey;
  if (!apiKey) throw new Error('listWebhooks: `apiKey` is required.');

  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const hmacSecret = opts.hmacSecret || apiKey;
  const timestamp = opts.timestamp ?? Date.now();
  const fetchImpl = getFetch(opts);

  const { url, path } = resolveEndpoint(baseUrl, ENDPOINT_SUFFIX);
  const headers = buildSignedHeaders(apiKey, 'GET', path, timestamp, hmacSecret);

  const response = await fetchImpl(url, { method: 'GET', headers });
  const rawBody = await response.text();

  if (response.status < 200 || response.status >= 300) {
    const parsed = parseErrorBody(rawBody);
    throw new WebhookApiError(response.status, rawBody, parsed);
  }

  return JSON.parse(rawBody) as RegisterWebhookResult[];
}

/**
 * Deletes a registered webhook endpoint (signed `DELETE /webhooks/endpoints/:id`).
 * Requires the `fulfillment` scope on the API key.
 */
export async function deleteWebhook(opts: DeleteWebhookOptions): Promise<{ success: boolean }> {
  const apiKey = opts.apiKey;
  if (!apiKey) throw new Error('deleteWebhook: `apiKey` is required.');
  if (!opts.id) throw new Error('deleteWebhook: `id` is required.');

  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const hmacSecret = opts.hmacSecret || apiKey;
  const timestamp = opts.timestamp ?? Date.now();
  const logger = opts.logger || defaultLogger();
  const fetchImpl = getFetch(opts);

  const { url, path } = resolveEndpoint(baseUrl, `${ENDPOINT_SUFFIX}/${encodeURIComponent(opts.id)}`);
  const headers = buildSignedHeaders(apiKey, 'DELETE', path, timestamp, hmacSecret);

  const response = await fetchImpl(url, { method: 'DELETE', headers });
  const rawBody = await response.text();

  if (response.status < 200 || response.status >= 300) {
    const parsed = parseErrorBody(rawBody);
    throw new WebhookApiError(response.status, rawBody, parsed);
  }

  logger({
    timestamp: new Date().toISOString(),
    step: 'deleteWebhook',
    level: 'info',
    message: 'Webhook endpoint deleted.',
    details: { id: opts.id },
  });
  return { success: true };
}

/**
 * Sends an incoming webhook to the Digital Code Vault API.
 *
 * The webhook must include the merchant's webhook secret in the X-Webhook-Secret header
 * for authentication. The payload format is auto-detected by the server.
 *
 * @throws {WebhookApiError} on any non-2xx response.
 */
export async function sendIncomingWebhook(opts: {
  baseUrl?: string;
  webhookSecret: string;
  payload: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
  fetchImpl?: FetchLike;
}): Promise<{ success: boolean; webhookId: string; eventId: string }> {
  if (!opts.webhookSecret) throw new Error('sendIncomingWebhook: `webhookSecret` is required.');
  if (!opts.payload) throw new Error('sendIncomingWebhook: `payload` is required.');

  const baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const fetchImpl = getFetch(opts);
  const url = `${baseUrl}/webhooks/incoming`;
  const body = JSON.stringify(opts.payload);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Secret': opts.webhookSecret,
    ...(opts.extraHeaders || {}),
  };

  const response = await fetchImpl(url, { method: 'POST', headers, body });
  const rawBody = await response.text();

  if (response.status < 200 || response.status >= 300) {
    const parsed = parseErrorBody(rawBody);
    throw new WebhookApiError(response.status, rawBody, parsed);
  }

  return JSON.parse(rawBody);
}
