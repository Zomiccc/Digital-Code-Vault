// Public API surface for @digitalcodevault/webhook-sdk
//
// Two signing schemes — see SIGNING.md:
//  - Scheme A (outbound): registerWebhook / listWebhooks / deleteWebhook
//    HMAC key = the API key itself; signed input = METHOD\nPATH\n''\nTIMESTAMP
//  - Scheme B (inbound):  verifyIncomingSignature / verifyWebhookMiddleware
//    HMAC key = the endpoint `secret` from registration; signed input = raw JSON body

export { registerWebhook, listWebhooks, deleteWebhook } from './client.js';
export { verifyIncomingSignature, verifyWebhookMiddleware } from './verify.js';
export { signRequest, buildCanonicalString, resolveEndpoint, SERVER_SIGNED_BODY } from './sign.js';
export {
  WebhookApiError,
  type RegisterWebhookOptions,
  type RegisterWebhookResult,
  type ListEndpointsOptions,
  type DeleteWebhookOptions,
  type ApiErrorShape,
  type ConnectorLog,
  type Logger,
  type FetchLike,
} from './types.js';
