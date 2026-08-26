"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliveryController = exports.DeliveryApiController = void 0;
const common_1 = require("@nestjs/common");
const delivery_service_1 = require("./delivery.service");
let DeliveryApiController = class DeliveryApiController {
    deliveryService;
    constructor(deliveryService) {
        this.deliveryService = deliveryService;
    }
    async getDeliveryInfo(token) {
        return this.deliveryService.getDeliveryInfo(token);
    }
    async revealCode(token, req) {
        return this.deliveryService.revealCode(token, req.ip);
    }
};
exports.DeliveryApiController = DeliveryApiController;
__decorate([
    (0, common_1.Get)(':token'),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DeliveryApiController.prototype, "getDeliveryInfo", null);
__decorate([
    (0, common_1.Post)(':token/reveal'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DeliveryApiController.prototype, "revealCode", null);
exports.DeliveryApiController = DeliveryApiController = __decorate([
    (0, common_1.Controller)('d'),
    __metadata("design:paramtypes", [delivery_service_1.DeliveryService])
], DeliveryApiController);
let DeliveryController = class DeliveryController {
    deliveryService;
    constructor(deliveryService) {
        this.deliveryService = deliveryService;
    }
    async getDeliveryInfo(token, res) {
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
        }
        catch (err) {
            const msg = 'Invalid or expired link';
            const status = err.getStatus?.() || 500;
            res.status(status).send(this.errorPage(msg));
        }
    }
    async revealCode(token, req, res) {
        try {
            const result = await this.deliveryService.revealCode(token, req.ip);
            const codeRows = result.codes
                .map((c, i) => `
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
        }
        catch (err) {
            const msg = 'Invalid or expired link';
            const status = err.getStatus?.() || 500;
            res.status(status).send(this.errorPage(msg));
        }
    }
    errorPage(message) {
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
};
exports.DeliveryController = DeliveryController;
__decorate([
    (0, common_1.Get)(':token'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DeliveryController.prototype, "getDeliveryInfo", null);
__decorate([
    (0, common_1.Post)(':token/reveal'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], DeliveryController.prototype, "revealCode", null);
exports.DeliveryController = DeliveryController = __decorate([
    (0, common_1.Controller)('reveal'),
    __metadata("design:paramtypes", [delivery_service_1.DeliveryService])
], DeliveryController);
//# sourceMappingURL=delivery.controller.js.map