import { escapeHtml as e } from "../delivery/html";

export type DeliveryEmail = {
  customerName: string;
  productName: string;
  reference: string;
  link: string;
  amount?: string;
  expiryMinutes?: number;
};
/** Table-based layout and inline styles remain usable when email clients strip CSS. */
export function deliveryEmail(data: DeliveryEmail): string {
  const url = new URL(data.link);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Delivery links must use HTTP or HTTPS");
  const link = e(url.href);
  const row = (label: string, value: string) =>
    `<tr><td style="padding:12px 0;border-top:1px solid #dce5dd;color:#5b7164;font-size:13px;width:110px;vertical-align:top;">${label}</td><td style="padding:12px 0 12px;border-top:1px solid #dce5dd;color:#203c2e;font-size:13px;font-weight:bold;word-break:break-word;overflow-wrap:anywhere;">${e(value)}</td></tr>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Your digital delivery is ready</title><style>@media only screen and (max-width:600px){.outer{padding:16px 8px!important}.body-cell{padding:26px 22px!important}.email-title{font-size:30px!important}.cta{display:block!important;text-align:center!important}}</style></head>
<body style="margin:0;padding:0;background:#f3f6f1;font-family:Arial,Helvetica,sans-serif;color:#203c2e;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Your ${e(data.productName)} delivery is ready. Open your private link to reveal your codes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f1;"><tr><td class="outer" align="center" style="padding:40px 20px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td style="padding:0 8px 24px;font-size:21px;font-weight:bold;color:#176b53;">CodeHub <span style="font-size:12px;font-weight:normal;color:#607668;">&nbsp; / &nbsp; DIGITAL DELIVERY</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid #dae4db;border-radius:18px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:6px;background:#176b53;border-radius:18px 18px 0 0;"></td></tr><tr><td class="body-cell" style="padding:38px 40px;">
<p style="margin:0 0 20px;font-size:11px;letter-spacing:2px;font-weight:bold;color:#39734f;">ORDER READY</p>
<h1 class="email-title" style="margin:0 0 18px;font-size:36px;line-height:1.15;letter-spacing:-1px;color:#193a2c;">Something good<br>is ready.</h1>
<p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:#4e6759;">Hello ${e(data.customerName)},</p><p style="margin:0 0 26px;font-size:15px;line-height:1.7;color:#4e6759;">Your purchase is ready for you. Open your private delivery page to reveal and copy your digital codes.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f1;border:1px solid #dce5dd;border-radius:12px;table-layout:fixed;"><tr><td style="padding:22px;"><p style="margin:0 0 8px;font-size:10px;letter-spacing:1.5px;color:#58725f;font-weight:bold;">YOUR PURCHASE</p><h2 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#203c2e;word-break:break-word;">${e(data.productName)}</h2><table width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">${row("Reference", data.reference)}${data.amount ? row("Amount", data.amount) : ""}${row("Delivery", "Digital code")}</table></td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:26px 0 12px;"><tr><td align="center" bgcolor="#176b53" style="border-radius:9px;mso-padding-alt:16px 24px;"><a class="cta" href="${link}" style="display:block;padding:17px 24px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border:1px solid #176b53;border-radius:9px;">View my delivery &nbsp; →</a></td></tr></table>
<p style="margin:0 0 26px;text-align:center;font-size:12px;line-height:1.6;color:#58705f;">${data.expiryMinutes ? `This link expires in ${e(data.expiryMinutes)} minutes.` : "Permanent access. Come back whenever you need your codes."}</p>
<p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#203c2e;">A little privacy goes a long way.</p><p style="margin:0 0 24px;font-size:13px;line-height:1.7;color:#526b5b;">Keep this email and delivery link private. Anyone with the link can view your codes. Redeem them in the product provider’s app or website.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr><td style="padding-top:22px;border-top:1px solid #dce5dd;"><p style="margin:0 0 8px;font-size:12px;line-height:1.7;color:#526b5b;">Button not working? Copy this link into your browser:</p><a href="${link}" style="font-size:12px;line-height:1.8;color:#176b53;word-break:break-all;overflow-wrap:anywhere;">${link}</a></td></tr></table>
</td></tr></table></td></tr><tr><td style="padding:24px 16px;text-align:center;"><p style="margin:0 0 8px;font-size:12px;line-height:1.7;color:#526b5b;">Need a hand? Contact your seller with your order reference.</p><p style="margin:0;font-size:11px;color:#607668;">CodeHub · Digital goods. Thoughtfully delivered.</p></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}
