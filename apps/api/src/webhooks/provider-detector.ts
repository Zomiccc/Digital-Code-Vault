export interface DetectedProvider {
  provider: string;
  platform: string;
  confidence: number;
}

export interface NormalizedWebhookPayload {
  provider: string;
  platform: string;
  eventId: string | null;
  orderId: string | null;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
  productCategory: string | null;
  customerName: string | null;
  customerEmail: string | null;
  quantity: number | null;
  amount: number | null;
  currency: string | null;
  paymentStatus: string | null;
  orderStatus: string | null;
  imageUrl: string | null;
}

export class ProviderDetector {
  static detect(headers: Record<string, any>, payload: any): DetectedProvider {
    const headerKeys = Object.keys(headers || {}).map((k) => k.toLowerCase());
    const headerStr = headerKeys.join(' ');
    const userAgent = (headers['user-agent'] || headers['User-Agent'] || '').toLowerCase();
    const payloadStr = JSON.stringify(payload || {}).toLowerCase();

    // Shopify: X-Shopify-Topic header
    if (headerKeys.includes('x-shopify-topic') || headerKeys.includes('x-shopify-hmac-sha256')) {
      return { provider: 'shopify', platform: 'shopify', confidence: 0.99 };
    }

    // WooCommerce: X-WC-Webhook-Source / X-WC-Webhook-Topic
    if (headerKeys.includes('x-wc-webhook-source') || headerKeys.includes('x-wc-webhook-topic')) {
      return { provider: 'woocommerce', platform: 'woocommerce', confidence: 0.99 };
    }

    // Stripe: Stripe-Signature header / event.type in payload
    if (headerKeys.includes('stripe-signature') || (payload?.object && payload?.type?.startsWith('stripe.'))) {
      return { provider: 'stripe', platform: 'stripe', confidence: 0.95 };
    }

    // PayPal: PayPal-Transmission-Id header
    if (headerKeys.includes('paypal-transmission-id') || headerStr.includes('paypal')) {
      return { provider: 'paypal', platform: 'paypal', confidence: 0.95 };
    }

    // ezload / custom: platform field in payload
    if (payload?.platform === 'ezload' || payload?.source === 'ezload') {
      return { provider: 'ezload', platform: 'ezload', confidence: 0.9 };
    }

    // Generic e-commerce: check for common order structures
    if (payload?.order || payload?.checkout || payload?.transaction) {
      return { provider: 'generic_ecommerce', platform: payload?.platform || 'generic', confidence: 0.5 };
    }

    // Fallback: use platform field from payload
    const platform = payload?.platform || payload?.source || payload?.provider || 'unknown';
    return { provider: platform, platform, confidence: 0.1 };
  }

  static normalize(headers: Record<string, any>, payload: any): NormalizedWebhookPayload {
    const detected = ProviderDetector.detect(headers, payload);
    const p = payload || {};

    // Shopify order/paid event
    if (detected.provider === 'shopify') {
      const order = p.order || p;
      const lineItem = order?.line_items?.[0] || {};
      const customer = order?.customer || {};
      const shipping = order?.shipping_address || order?.billing_address || {};
      return {
        provider: detected.provider,
        platform: detected.platform,
        eventId: p.id || order?.id || p.event_id || null,
        orderId: String(order?.id || order?.order_id || p.order_id || '') || null,
        productId: String(lineItem?.product_id || '') || null,
        productName: lineItem?.title || lineItem?.name || null,
        productSku: lineItem?.sku || null,
        productCategory: lineItem?.product_type || null,
        customerName: `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || null,
        customerEmail: customer?.email || order?.email || null,
        quantity: lineItem?.quantity || 1,
        amount: Number(order?.total_price || order?.total || 0),
        currency: order?.currency || 'USD',
        paymentStatus: order?.financial_status === 'paid' ? 'paid' : order?.financial_status || null,
        orderStatus: order?.fulfillment_status || order?.financial_status || null,
        imageUrl: lineItem?.image?.src || null,
      };
    }

    // WooCommerce order event
    if (detected.provider === 'woocommerce') {
      const order = p.order || p;
      const lineItem = order?.line_items?.[0] || {};
      return {
        provider: detected.provider,
        platform: detected.platform,
        eventId: p.id || order?.id || p.event_id || null,
        orderId: String(order?.id || order?.order_id || p.order_id || '') || null,
        productId: String(lineItem?.product_id || p.product_id || '') || null,
        productName: lineItem?.name || lineItem?.title || p.product_name || p.productName || null,
        productSku: lineItem?.sku || p.product_sku || p.productSku || null,
        productCategory: lineItem?.categories?.[0]?.name || p.category || p.product_category || null,
        customerName: `${order?.billing?.first_name || ''} ${order?.billing?.last_name || ''}`.trim() || p.customer_name || p.customerName || null,
        customerEmail: order?.billing?.email || p.customer_email || p.customerEmail || null,
        quantity: lineItem?.quantity || p.quantity || 1,
        amount: Number(order?.total || order?.total_price || p.amount || 0),
        currency: order?.currency || p.currency || 'USD',
        paymentStatus: order?.status === 'completed' || order?.status === 'processing' ? 'paid' : order?.status || p.payment_status || p.paymentStatus || null,
        orderStatus: order?.status || p.order_status || p.orderStatus || null,
        imageUrl: lineItem?.image?.src || p.image_url || p.imageUrl || null,
      };
    }

    // Stripe payment_intent.succeeded
    if (detected.provider === 'stripe') {
      const data = p.data?.object || p;
      const metadata = data?.metadata || {};
      return {
        provider: detected.provider,
        platform: detected.platform,
        eventId: p.id || data?.id || null,
        orderId: metadata?.order_id || data?.id || null,
        productId: metadata?.product_id || null,
        productName: metadata?.product_name || null,
        productSku: metadata?.sku || null,
        productCategory: null,
        customerName: data?.shipping?.name || metadata?.customer_name || null,
        customerEmail: data?.receipt_email || data?.customer_email || null,
        quantity: Number(metadata?.quantity || 1),
        amount: Number(data?.amount_total || data?.amount || 0) / 100,
        currency: (data?.currency || 'usd').toUpperCase(),
        paymentStatus: data?.status === 'succeeded' ? 'paid' : data?.status || null,
        orderStatus: data?.status || null,
        imageUrl: null,
      };
    }

    // PayPal payment event
    if (detected.provider === 'paypal') {
      const resource = p?.resource || p;
      return {
        provider: detected.provider,
        platform: detected.platform,
        eventId: p?.id || resource?.id || null,
        orderId: resource?.invoice_id || resource?.id || null,
        productId: null,
        productName: resource?.items?.[0]?.name || null,
        productSku: resource?.items?.[0]?.sku || null,
        productCategory: null,
        customerName: resource?.payer?.name?.given_name
          ? `${resource?.payer?.name?.given_name} ${resource?.payer?.name?.surname || ''}`.trim()
          : null,
        customerEmail: resource?.payer?.email_address || null,
        quantity: Number(resource?.items?.[0]?.quantity || 1),
        amount: Number(resource?.amount?.value || resource?.total || 0),
        currency: resource?.amount?.currency_code || 'USD',
        paymentStatus: resource?.status === 'COMPLETED' || resource?.status === 'completed' ? 'paid' : resource?.status || null,
        orderStatus: resource?.status || null,
        imageUrl: null,
      };
    }

    // Generic / ezload: use flexible field mapping
    return {
      provider: detected.provider,
      platform: detected.platform,
      eventId: p.event_id || p.id || p.order_id || p.webhook_id || p.transaction_id || null,
      orderId: String(p.order_id || p.orderId || p.id || p.transaction_id || '') || null,
      productId: String(p.product_id || p.productId || p.sku || p.item_id || '') || null,
      productName: p.product_name || p.productName || p.name || p.title || p.item_name || null,
      productSku: p.sku || p.product_sku || p.item_sku || null,
      productCategory: p.category || p.product_category || p.type || null,
      customerName: p.customer_name || p.customerName || p.buyer_name || p.payer_name || null,
      customerEmail: p.customer_email || p.customerEmail || p.buyer_email || p.payer_email || p.email || null,
      quantity: p.quantity || p.qty || 1,
      amount: Number(p.amount || p.price || p.total || p.value || 0),
      currency: p.currency || p.currency_code || 'USD',
      paymentStatus: p.payment_status || p.status || p.state || p.payment_state || null,
      orderStatus: p.order_status || p.status || p.state || null,
      imageUrl: p.image_url || p.imageUrl || p.image || null,
    };
  }
}
