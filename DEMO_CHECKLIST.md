# DCV End-to-End Demo Checklist

## Prerequisites

- [ ] DCV API running (`npm run dev:api` from project root)
- [ ] Merchant portal running (`npm run dev:merchant` from project root)
- [ ] Database seeded with PSN product + $50 denomination + 10 codes
- [ ] Ezload WooCommerce plugin installed and configured with:
  - API URL: `http://localhost:3000/api/v1`
  - Webhook Secret: (from merchant dashboard)
  - API Key: (from merchant dashboard)

---

## Step 1: Create Test Product in WooCommerce

- [ ] In WooCommerce, create a new product:
  - Name: **PSN $50 Digital Code TEST**
  - SKU: **PSN-USD-50**
  - Price: **$50**
  - Type: Simple product
  - Virtual: Yes (checkbox)
- [ ] Publish the product
- [ ] Verify the product appears on Ezload storefront

> **Note:** Do NOT modify existing products (PS5, etc.). This is a new, separate product.

---

## Step 2: Trigger a Test Webhook (First Purchase)

- [ ] Place a test order on Ezload for "PSN $50 Digital Code TEST"
- [ ] Use a test payment method (e.g., Cash on Delivery or test gateway)
- [ ] Enter a real customer email address you can check
- [ ] Complete the checkout
- [ ] In WooCommerce admin, change the order status to **Completed**

> This triggers the WooCommerce `woocommerce_order_status_completed` hook → DCV webhook.

---

## Step 3: Verify Webhook Reached DCV

- [ ] Open DCV Merchant Portal → **Incoming Webhooks** page
- [ ] Verify a webhook appears with:
  - Platform: `woocommerce`
  - Product: "PSN $50 Digital Code TEST"
  - SKU: `PSN-USD-50`
  - Status: **COMPLETED** (if already processed) or **PENDING** (if still processing)
- [ ] If status is **FAILED**, check the error message

> The first webhook will auto-create a **ConnectedProduct** record (synced from WooCommerce).

---

## Step 4: Map the Product (SKU → DCV Product)

- [ ] Open DCV Merchant Portal → **Product Mapping** page
- [ ] Find the row for "PSN $50 Digital Code TEST" (SKU: PSN-USD-50)
- [ ] Click **Edit**
- [ ] Set **DCV Product** → `PSN (USA)`
- [ ] Set **Denomination** → `$50 USD` (or leave as "Auto" to match by amount)
- [ ] Set **Inventory Source** → `DCV` (or `AUTO` if merchant has own codes too)
- [ ] Click **Save** (checkmark)

> Now the SKU `PSN-USD-50` is explicitly mapped to DCV's PSN product + $50 denomination.

---

## Step 5: Place a Second Test Order (Now Mapped)

- [ ] Place another test order on Ezload for "PSN $50 Digital Code TEST"
- [ ] Use a real customer email address
- [ ] Complete checkout
- [ ] Mark order as **Completed** in WooCommerce admin

---

## Step 6: Verify Fulfillment

- [ ] Open DCV Merchant Portal → **Orders** page
- [ ] Verify a new fulfillment request appears with:
  - Status: **ALLOCATED** or **DELIVERED**
  - Product: PSN
  - Amount: $50
  - Reference ID: WooCommerce order ID
- [ ] Open DCV Merchant Portal → **Dashboard** → check wallet balance decreased by $50 (if DCV inventory used)

---

## Step 7: Verify Customer Email

- [ ] Check the customer email inbox used in Step 5
- [ ] Verify email received with:
  - Subject: Your digital code / delivery link
  - A delivery/reveal link (URL like `http://localhost:3000/api/v1/reveal/...`)

---

## Step 8: Customer Reveals Code

- [ ] Customer opens the delivery link in a browser
- [ ] Verify the reveal page shows:
  - Product name: PSN
  - A "Reveal Code" button or the code is displayed
- [ ] Click reveal → verify the digital code appears (format: `PSN-USA-50-XXXX-XXXXXXXX`)
- [ ] Refresh the page → code should still be visible (permanent link)

---

## Step 9: Verify Code Status in DCV

- [ ] Open DCV Admin Portal → Codes section
- [ ] Verify one PSN $50 code is now marked as **DELIVERED**
- [ ] Verify the remaining PSN $50 codes are still **AVAILABLE**

---

## Step 10: Test Duplicate Webhook Protection

- [ ] In WooCommerce admin, re-trigger the same order (change status away from completed, then back)
- [ ] OR: Open DCV Merchant Portal → Incoming Webhooks → click **Retry** on the same webhook
- [ ] Verify: No second code is allocated
- [ ] Verify: The same fulfillment request is returned (idempotent)
- [ ] Verify: Wallet is NOT charged a second time

---

## Step 11: Verify WooCommerce Order Update (if plugin configured)

- [ ] Check the WooCommerce order for an admin note from DCV
- [ ] If outgoing webhooks are configured, the order should have a note like "DCV fulfillment completed"

---

## Failure Case Tests

### No Inventory
- [ ] Void all PSN $50 codes in DCV admin (or upload 0 codes)
- [ ] Place a new test order → verify DCV returns "INSUFFICIENT_STOCK"
- [ ] Verify no code is consumed, no wallet charge

### Invalid SKU
- [ ] Create a WooCommerce product with SKU `UNKNOWN-SKU-999`
- [ ] Place order → verify DCV logs "Product not found"
- [ ] Verify no code is consumed

### Invalid Webhook Secret
- [ ] Send a webhook with wrong `X-Webhook-Secret` header
- [ ] Verify DCV rejects with "INVALID_WEBHOOK_SECRET"

### Non-Paid Order
- [ ] Place an order but leave status as "Pending" or "On Hold"
- [ ] Verify DCV skips processing (status: SKIPPED)

---

## Summary

The complete customer journey:

```
Customer opens Ezload
  → selects "PSN $50 Digital Code TEST"
  → adds to cart
  → enters email
  → completes payment
  → WooCommerce marks order as Completed
  → DCV receives webhook (X-Webhook-Secret auth)
  → DCV identifies merchant
  → DCV looks up SKU "PSN-USD-50" → ConnectedProduct → dcvProductId
  → DCV resolves to PSN product + $50 denomination
  → DCV checks inventory (DCV pool)
  → DCV atomically reserves one code
  → DCV creates fulfillment (ALLOCATED)
  → Wallet charged $50 (DCV inventory)
  → Delivery token + link generated
  → Reveal code email sent to customer
  → Customer opens link
  → Customer reveals code
  → Code marked DELIVERED
  → Outgoing webhook fired to WooCommerce
  → Duplicate webhook rejected (idempotent)
```
