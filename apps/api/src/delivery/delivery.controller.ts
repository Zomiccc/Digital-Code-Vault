import { Controller, Get, Post, Param, Req, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { DeliveryService } from './delivery.service';

/**
 * JSON delivery API — used by the customer portal (/d/:token).
 * Token-based, no auth. Codes are only returned by the reveal endpoint.
 */
@Controller('d')
export class DeliveryApiController {
  constructor(private deliveryService: DeliveryService) {}

  @Get(':token')
  async getDeliveryInfo(@Param('token') token: string) {
    return this.deliveryService.getDeliveryInfo(token);
  }

  @Post(':token/reveal')
  async revealCode(@Param('token') token: string, @Req() req: any) {
    return this.deliveryService.revealCode(token, req.ip);
  }
}

@Controller('reveal')
export class DeliveryController {
  constructor(private deliveryService: DeliveryService) {}

  /**
   * GET /reveal/:token
   * Shows the reveal page with the code displayed directly.
   * The link is permanent — it never expires.
   * The code can be viewed multiple times.
   */
  @Get(':token')
  async getDeliveryInfo(@Param('token') token: string, @Res() res: Response) {
    try {
      const info = await this.deliveryService.getDeliveryInfo(token);

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeHub — ${info.product_name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e2e8f0;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 48px;
      max-width: 520px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    }
    .logo {
      width: 56px; height: 56px;
      background: #6366f1;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      margin-bottom: 24px;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .product { color: #94a3b8; font-size: 15px; margin-bottom: 32px; }
    .status-badge {
      display: inline-block;
      background: #064e3b;
      color: #34d399;
      padding: 6px 16px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 24px;
    }
    .permanent-badge {
      display: inline-block;
      background: #1e3a8a;
      color: #93c5fd;
      padding: 6px 16px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 24px;
    }
    .reveal-btn {
      background: #6366f1;
      color: #fff;
      border: none;
      padding: 16px 48px;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .reveal-btn:hover { background: #4f46e5; transform: translateY(-2px); }
    .loading { color: #94a3b8; font-size: 14px; margin-top: 16px; display: none; }
    .error { color: #f87171; font-size: 14px; margin-top: 16px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🔐</div>
    <h1>CodeHub</h1>
    <p class="product">Product: <strong>${info.product_name}</strong></p>
    <div class="status-badge">✓ Order Ready</div>
    <div class="permanent-badge">🔗 Permanent Link — Never Expires</div>
    <button class="reveal-btn" onclick="revealCodes()">Reveal My Code</button>
    <p class="loading" id="loading">Revealing...</p>
    <p class="error" id="error"></p>
  </div>
  <script>
    async function revealCodes() {
      const btn = document.querySelector('.reveal-btn');
      const loading = document.getElementById('loading');
      const error = document.getElementById('error');
      btn.disabled = true;
      btn.textContent = 'Revealing...';
      loading.style.display = 'block';
      error.style.display = 'none';

      try {
        const res = await fetch(window.location.href + '/reveal', { method: 'POST' });
        const html = await res.text();
        document.open();
        document.write(html);
        document.close();
      } catch (e) {
        error.textContent = 'Failed to reveal codes. Please try again.';
        error.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Reveal My Code';
        loading.style.display = 'none';
      }
    }
  </script>
</body>
</html>`;
      res.type('text/html').send(html);
    } catch (err) {
      const msg = 'Invalid or expired link';
      const status = (err as any).getStatus?.() || 500;
      res.status(status).send(this.errorPage(msg));
    }
  }

  /**
   * POST /reveal/:token/reveal
   * Reveals the code(s). Can be called multiple times — the code is always shown.
   */
  @Post(':token/reveal')
  async revealCode(@Param('token') token: string, @Req() req: any, @Res() res: Response) {
    try {
      const result = await this.deliveryService.revealCode(token, req.ip);

      const codeRows = result.codes
        .map((c: any, i: number) => `
          <div class="code-item">
            <div class="code-denom">${c.denomination}</div>
            <div class="code-value" id="code-${i}">${c.code}</div>
            <button class="copy-btn" onclick="copyCode(${i}, '${c.code}')">Copy Code</button>
          </div>`)
        .join('');

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeHub — Codes Revealed</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e2e8f0;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 48px;
      max-width: 520px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    }
    .logo {
      width: 56px; height: 56px;
      background: #059669;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      margin-bottom: 24px;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .product { color: #94a3b8; font-size: 15px; margin-bottom: 32px; }
    .codes-container { display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; }
    .code-item {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 24px;
    }
    .code-denom {
      color: #94a3b8;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .code-value {
      font-family: 'Courier New', monospace;
      font-size: 28px;
      font-weight: 700;
      color: #6366f1;
      letter-spacing: 2px;
      margin-bottom: 12px;
      word-break: break-all;
    }
    .copy-btn {
      background: #334155;
      color: #e2e8f0;
      border: 1px solid #475569;
      padding: 8px 24px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .copy-btn:hover { background: #475569; }
    .copy-btn.copied { background: #059669; color: #fff; }
    .permanent-note {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px 16px;
      color: #94a3b8;
      font-size: 13px;
      margin-bottom: 24px;
    }
    .footer { color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">✅</div>
    <h1>Your Code</h1>
    <p class="product">Product: <strong>${result.product_name}</strong></p>
    <div class="codes-container">
      ${codeRows}
    </div>
    <div class="permanent-note">
      🔗 This link is permanent and never expires. You can return here anytime to view your code.
    </div>
    <p class="footer">CodeHub — Delivered securely</p>
  </div>
  <script>
    function copyCode(index, code) {
      navigator.clipboard.writeText(code).then(() => {
        const btn = event.target;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy Code';
          btn.classList.remove('copied');
        }, 2000);
      });
    }
  </script>
</body>
</html>`;
      res.type('text/html').send(html);
    } catch (err) {
      const msg = 'Invalid or expired link';
      const status = (err as any).getStatus?.() || 500;
      res.status(status).send(this.errorPage(msg));
    }
  }

  private errorPage(message: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeHub — Error</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e2e8f0;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 48px;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    }
    .logo { width: 56px; height: 56px; background: #dc2626; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 24px; }
    h1 { font-size: 22px; margin-bottom: 12px; }
    p { color: #94a3b8; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚠️</div>
    <h1>Link Error</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  }
}
