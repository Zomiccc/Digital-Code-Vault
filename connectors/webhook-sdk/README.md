# @digitalcodevault/webhook-sdk

JavaScript/TypeScript SDK for connecting your application to the Digital Code Vault webhook system.

> **Requires a Node.js backend.** This SDK uses `node:crypto` for HMAC signing and needs
> a server with a publicly reachable URL to register and receive deliveries.
> A browser-only React app has no URL to register and nothing to receive deliveries with.
> Use this in Express, Next.js API routes, Nuxt server routes, Fastify, etc.

## Install

```bash
npm install @digitalcodevault/webhook-sdk
```

## Two signing schemes — don't mix them up

This SDK implements **two independent HMAC-SHA256 schemes**. They look similar (both hex
digests) but use different keys and sign over different inputs. See `SIGNING.md` for the
full reference.

| | Scheme A (outbound) | Scheme B (inbound) |
|---|---|---|
| **Direction** | Your server → Platform | Platform → Your server |
| **Used by** | `registerWebhook`, `listWebhooks`, `deleteWebhook` | `verifyIncomingSignature`, `verifyWebhookMiddleware` |
| **HMAC key** | Your API key (`pk_xxx.yyy`) | Endpoint `secret` from registration |
| **Signed input** | `METHOD\nPATH\n""\nTIMESTAMP` | Raw JSON body string |
| **Header** | `X-Signature` | `X-Webhook-Signature` |

## Quick start

### 1. Register a webhook endpoint

First, generate an API key from the merchant/admin portal. Then:

```js
import { registerWebhook } from '@digitalcodevault/webhook-sdk';

const result = await registerWebhook({
  apiKey: 'pk_xxxxxxxx.yyyyyyyyyyyy',  // from the admin portal
  url: 'https://your-site.com/webhooks/from-platform',
  skipVerification: false,              // set true to skip challenge check
  baseUrl: 'http://localhost:3000/api/v1', // optional, defaults to this
});

console.log(result);
// { id: '...', url: '...', status: 'ACTIVE', secret: '...' }

// STORE `result.secret` — you need it to verify inbound deliveries (Scheme B)
```

### 2. Verify incoming deliveries

```js
import { verifyWebhookMiddleware } from '@digitalcodevault/webhook-sdk';
import express from 'express';

const app = express();

// You MUST capture the raw body before JSON parsing for signature verification
app.use('/webhooks/from-platform',
  express.json({
    verify: (req, buf) => { req.rawBody = buf; },
  }),
  verifyWebhookMiddleware(ENDPOINT_SECRET),  // the secret from registration
  (req, res) => {
    // Signature verified — handle the event
    console.log('Event:', req.webhookEvent);
    console.log('Body:', req.body);
    res.json({ received: true });
  },
);
```

### 3. Verify a signature manually (non-Express)

```js
import { verifyIncomingSignature } from '@digitalcodevault/webhook-sdk';

const isValid = verifyIncomingSignature(
  rawBody,           // the exact raw body string/Buffer received
  signatureHeader,   // value of X-Webhook-Signature header
  endpointSecret,    // the secret returned at registration
);

if (!isValid) {
  // reject the delivery
}
```

## API reference

### `registerWebhook(opts): Promise<RegisterWebhookResult>`

Sends a signed `POST /api/v1/webhooks/endpoints` request.

**Options:**
- `apiKey` *(string, required)* — merchant API key from the admin portal
- `url` *(string, required)* — publicly reachable URL for the platform to deliver events to
- `skipVerification` *(boolean, default false)* — skip the server's challenge-response check
- `baseUrl` *(string, default `http://localhost:3000/api/v1`)* — API base URL
- `hmacSecret` *(string, default = `apiKey`)* — override the HMAC key (advanced)
- `timestamp` *(number, default `Date.now()`)* — override timestamp (testing)
- `fetchImpl` *(function)* — custom fetch implementation
- `logger` *(function)* — structured logger callback

**Returns:** `{ id, url, status, secret }` — **store `secret`** for verifying deliveries.

**Throws:** `WebhookApiError` on non-2xx responses (has `.status`, `.code`, `.rawBody`).

### `listWebhooks(opts): Promise<RegisterWebhookResult[]>`

Lists registered endpoints (signed `GET`). Requires `read` scope.

### `deleteWebhook(opts): Promise<{ success: boolean }>`

Deletes an endpoint (signed `DELETE`). Requires `fulfillment` scope.

### `verifyIncomingSignature(rawBody, signatureHeader, endpointSecret): boolean`

Verifies an `X-Webhook-Signature` header against the raw request body.

### `verifyWebhookMiddleware(endpointSecret, logger?): ExpressMiddleware`

Drop-in Express middleware that verifies `X-Webhook-Signature`. Requires `req.rawBody`
to be populated (use `express.json({ verify: ... })`).

On success: sets `req.webhookEvent` and `req.webhookVerified`, calls `next()`.
On failure: responds 401 with `{ error: 'INVALID_SIGNATURE', message: '...' }`.

## Security notes

- **Never expose your API key in client-side JavaScript.** The API key is the HMAC signing
  key — anyone who has it can make authenticated requests to the platform on your behalf.
- **Store the endpoint `secret` server-side only** (env var, database, etc.).
- The SDK uses constant-time comparison (`crypto.timingSafeEqual`) to prevent timing attacks.

## License

MIT
