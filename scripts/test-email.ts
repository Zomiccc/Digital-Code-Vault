import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const testEmail = process.argv[2] || 'norepfxons@gmail.com';
  const provider = process.env.EMAIL_PROVIDER || 'resend';
  const apiKey = process.env.SENDGRID_API_KEY || process.env.RESEND_API_KEY || '';
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'noreply@digitalcode.local';
  const fromName = process.env.SENDGRID_FROM_NAME || 'CodeHub';

  console.log(`Sending test email to: ${testEmail}`);
  console.log(`Provider: ${provider}`);
  console.log(`From: ${fromName} <${fromEmail}>`);
  console.log(`API Key present: ${apiKey ? 'yes (' + apiKey.slice(0, 8) + '...)' : 'NO'}`);
  console.log('');

  const subject = 'Test Email from CodeHub — Email Pipeline Check';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:#0f172a;color:#fff;padding:24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:22px;">Test Email from CodeHub</h1>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
        <p style="color:#374151;font-size:15px;">This is a test email to verify the email pipeline is working.</p>
        <p style="color:#374151;font-size:15px;">If you received this, email delivery is functioning correctly.</p>
        <p style="color:#6b7280;font-size:13px;margin-top:24px;">Sent at: ${new Date().toISOString()}</p>
      </div>
    </div>
  `;

  let response: Response;
  if (provider === 'sendgrid') {
    const body = {
      personalizations: [{ to: [{ email: testEmail }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: 'text/html', value: html }],
    };

    console.log('Sending via SendGrid...');
    response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } else {
    const body = {
      from: fromEmail,
      to: testEmail,
      subject,
      html,
    };

    console.log('Sending via Resend...');
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  }

  console.log(`\nHTTP Status: ${response.status} ${response.statusText}`);

  if (response.status >= 200 && response.status < 300) {
    const data: any = await response.json().catch(() => ({}));
    console.log(`✅ SUCCESS — Message ID: ${data.id || data.message_id || 'accepted'}`);
    console.log('Check your inbox (and spam folder).');
    process.exit(0);
  } else {
    const errorText = await response.text();
    console.log(`❌ FAILED — Response body:`);
    console.log(errorText);
    process.exit(1);
  }
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
