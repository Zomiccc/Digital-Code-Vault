# DCV Webhook Connector for WordPress

Connects WooCommerce and Elementor to the Digital Code Vault platform via webhooks.

## Features

- **Webhook endpoint registration** — registers your site's REST URL with the platform's API
- **Incoming delivery verification** — verifies `X-Webhook-Signature` on deliveries from the platform
- **WooCommerce → Platform** — forwards order events (processing, completed) to the platform's incoming webhook URL
- **Platform → WooCommerce** — receives `order.fulfilled` events and marks matching WooCommerce orders as completed
- **Elementor forms → Platform** — forwards Elementor Pro form submissions to the platform

## Installation

1. Upload the `wp-dcv-webhook` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Go to **WooCommerce → DCV Webhook** (or **Settings → DCV Webhook** if WooCommerce is not installed)
4. Generate an API key from the Digital Code Vault admin/merchant portal
5. Paste the API key into the **API Key** field and click **Save Settings**
6. Click **Register this site** to register your webhook endpoint with the platform

## How it works

### Two signing schemes (see `../SIGNING.md`)

| | Outbound (your site → platform) | Inbound (platform → your site) |
|---|---|---|
| **HMAC key** | Your API key (`pk_xxx.yyy`) | Endpoint `secret` from registration |
| **Signed input** | `METHOD\nPATH\n""\nTIMESTAMP` | Raw JSON body string |
| **Header** | `X-Signature` | `X-Webhook-Signature` |

### REST endpoint

The plugin registers: `POST /wp-json/dcv/v1/webhook`

This is the URL the platform delivers events to. It must be publicly reachable.

### Event forwarding

- `woocommerce_order_status_processing` → forwards order to platform
- `woocommerce_order_status_completed` → forwards order to platform
- `elementor_pro/forms/new_record` → forwards form submission to platform

### Incoming events

- `order.fulfilled` → finds WooCommerce order by reference ID, marks it as completed

## Security

- The API key is stored in `wp_options` and is never exposed via any unauthenticated REST route
- The endpoint secret is stored in `wp_options` and only used server-side for signature verification
- All incoming deliveries are verified using `hash_equals()` (constant-time comparison) to prevent timing attacks
- All operations are logged to the WordPress error log with `[DCV-Webhook]` prefix for support debugging

## Debugging

All webhook operations are logged to the standard WordPress error log (`wp-content/debug.log` with `WP_DEBUG` enabled). Each log entry includes:
- Timestamp
- Step (e.g. `register`, `incoming_delivery`, `woocommerce_forward`)
- Message
- Structured details (JSON)

## Requirements

- WordPress 5.6+
- PHP 7.4+
- WooCommerce (optional, for order event forwarding and incoming order fulfillment)
- Elementor Pro (optional, for form submission forwarding)
