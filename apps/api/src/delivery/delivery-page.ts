import { escapeHtml as e } from "./html";
import { deliveryStyles } from "./delivery.styles";

type DeliveryView = {
  product_name?: string;
  reference_id?: string | null;
  fulfillment_id?: string;
  is_revealed?: boolean;
  codes?: { denomination: string; code: string }[];
};
const lock =
  '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>';
const gift =
  '<svg aria-hidden="true" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 11v10h16V11M12 7v14M3 7h18v4H3zM12 7C3 7 6 0 9 3l3 4Zm0 0c9 0 6-7 3-4l-3 4Z"/></svg>';

export function deliveryPage(
  info: DeliveryView,
  token: string,
  nonce: string,
  error?: string,
): string {
  const opened = !!info.codes?.length;
  const title = error
    ? "Let’s find your delivery."
    : opened
      ? "All yours. Ready to use."
      : "Something good is ready.";
  const action = `/api/v1/reveal/${encodeURIComponent(token)}/reveal`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>CodeHub — ${e(error ? "Delivery unavailable" : info.product_name)}</title><style>${deliveryStyles}</style></head>
<body><div class="delivery-shell"><header class="brand-bar"><a class="brand" href="#main"><span class="brand-icon">${lock}</span>CodeHub<span class="brand-divider"></span>Delivery</a><span class="private-label">${lock} Private delivery</span></header>
<main id="main"><div class="eyebrow">YOUR DIGITAL DELIVERY</div><h1>${title}</h1><p class="intro">${opened ? "Copy your codes below and redeem them with the product provider." : "Your purchase, in one place. Reveal your codes when you’re ready."}</p>
${
  error
    ? `<section class="panel state-panel"><h2>Delivery unavailable</h2><p role="alert">${e(error)}</p><p>Open the original link in your delivery email. If you still need help, contact your seller with your order reference.</p></section>`
    : `
<div class="delivery-grid"><section class="panel order-panel" aria-labelledby="order-heading"><span class="status"><span></span> Order ready</span><div class="product-icon">${gift}</div><p class="eyebrow">YOUR PURCHASE</p><h2 id="order-heading">${e(info.product_name)}</h2><dl>${info.reference_id || info.fulfillment_id ? `<div><dt>Order reference</dt><dd>${e(info.reference_id || info.fulfillment_id)}</dd></div>` : ""}<div><dt>Delivery method</dt><dd>Digital code</dd></div><div><dt>Link availability</dt><dd>Permanent access</dd></div></dl><div class="order-note">${lock}<p>Keep this link private. Anyone with it can view your codes.</p></div></section>
<section class="panel reveal-panel" aria-labelledby="codes-heading"><div class="section-heading"><span class="step">${lock}</span><span class="eyebrow">${opened ? "DELIVERY OPENED" : "READY WHEN YOU ARE"}</span></div><h2 id="codes-heading">${opened ? "Your digital codes" : "Unlock your next experience."}</h2><p>${opened ? "Use each code with the matching product and region." : "Your codes stay hidden until you choose to reveal them. You can return to this link to view them again."}</p>
${opened ? `<div class="code-list">${info.codes!.map((code, i) => `<article class="code-item"><div class="code-top"><span>Code ${String(i + 1).padStart(2, "0")} <strong>${e(code.denomination)}</strong></span><button type="button" class="copy" data-copy="${i}" aria-label="Copy code ${i + 1}">Copy</button></div><code id="code-${i}" tabindex="0">${e(code.code)}</code></article>`).join("")}</div><p class="copy-notice" id="copy-notice" role="status" aria-live="polite"></p><noscript><p>Select a code and copy it manually.</p></noscript>` : `<div class="locked-preview" aria-hidden="true">${lock}<span>•••• — •••• — ••••</span><small>Waiting to be revealed</small></div><form method="post" action="${e(action)}"><button class="primary" type="submit">${info.is_revealed ? "View my codes again" : "Reveal my codes"} <span aria-hidden="true">→</span></button></form><p class="micro">Code access is recorded for security.</p>`}
<div class="next-step"><span>01</span><div><h3>${opened ? "Redeem with your provider" : "Reveal your codes"}</h3><p>${opened ? "Open the provider’s app or website and follow their redemption instructions." : "Use the button above to securely view your purchase."}</p></div></div><div class="next-step"><span>02</span><div><h3>Keep your delivery email</h3><p>Your link never expires. Return whenever you need your codes.</p></div></div></section></div>`
}
<aside class="help"><strong>Need a hand?</strong> Contact the seller who sent your delivery email and include your order reference.</aside></main><footer><span class="brand">CodeHub</span><span>Digital goods. Thoughtfully delivered.</span><span>${lock} Keep your codes private</span></footer></div>
<script nonce="${e(nonce)}">
const form = document.querySelector('form');
if (form) form.addEventListener('submit', () => { const button = form.querySelector('button'); button.disabled = true; button.textContent = 'Revealing your codes…'; });
window.addEventListener('pageshow', () => { if (form) { const button = form.querySelector('button'); button.disabled = false; button.textContent = 'Reveal my codes →'; } });
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const code = document.getElementById('code-' + button.dataset.copy);
  const notice = document.getElementById('copy-notice');
  try {
    await navigator.clipboard.writeText(code.textContent);
    document.querySelectorAll('[data-copy]').forEach(other => other.textContent = 'Copy');
    button.textContent = 'Copied'; notice.textContent = 'Code ' + (Number(button.dataset.copy) + 1) + ' copied to clipboard.';
  } catch (_) { notice.textContent = 'Copy isn’t available. Select the code and copy it manually.'; code.focus(); }
}));
</script></body></html>`;
}
