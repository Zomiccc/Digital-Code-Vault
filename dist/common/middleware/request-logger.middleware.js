"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestLoggerMiddleware = void 0;
const common_1 = require("@nestjs/common");
const REDACTED_FIELDS = [
    'password', 'passwordHash', 'secret', 'apiKey', 'api_key', 'token',
    'encryptedCode', 'code', 'authorization', 'cookie', 'x-signature',
    'x-api-key', 'keyHash', 'twoFactorSecret', 'webhookSecret',
];
function redact(obj) {
    if (typeof obj !== 'object' || obj === null)
        return obj;
    if (Array.isArray(obj))
        return obj.map(redact);
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (REDACTED_FIELDS.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
            result[key] = '[REDACTED]';
        }
        else {
            result[key] = redact(value);
        }
    }
    return result;
}
let RequestLoggerMiddleware = class RequestLoggerMiddleware {
    logger = new common_1.Logger('HTTP');
    use(req, res, next) {
        const { method, originalUrl, ip } = req;
        const startTime = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            const { statusCode } = res;
            this.logger.log(`${method} ${originalUrl} ${statusCode} ${duration}ms - ${ip}`);
        });
        next();
    }
};
exports.RequestLoggerMiddleware = RequestLoggerMiddleware;
exports.RequestLoggerMiddleware = RequestLoggerMiddleware = __decorate([
    (0, common_1.Injectable)()
], RequestLoggerMiddleware);
//# sourceMappingURL=request-logger.middleware.js.map