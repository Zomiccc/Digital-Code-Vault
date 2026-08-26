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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeyGuard = exports.SCOPES_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const auth_service_1 = require("../auth.service");
const redis_service_1 = require("../../redis/redis.service");
const config_1 = require("@nestjs/config");
exports.SCOPES_KEY = 'scopes';
let ApiKeyGuard = class ApiKeyGuard {
    authService;
    redisService;
    configService;
    reflector;
    constructor(authService, redisService, configService, reflector) {
        this.authService = authService;
        this.redisService = redisService;
        this.configService = configService;
        this.reflector = reflector;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['x-api-key'];
        const signature = request.headers['x-signature'];
        const timestamp = request.headers['x-timestamp'];
        const idempotencyKey = request.headers['idempotency-key'];
        if (!apiKey || !signature || !timestamp) {
            throw new common_1.UnauthorizedException({
                error: 'UNAUTHORIZED',
                code: 'MISSING_CREDENTIALS',
                message: 'X-Api-Key, X-Signature, and X-Timestamp headers are required',
            });
        }
        if (!this.authService.verifyTimestamp(timestamp)) {
            throw new common_1.UnauthorizedException({
                error: 'UNAUTHORIZED',
                code: 'TIMESTAMP_EXPIRED',
                message: 'Request timestamp outside allowed window',
            });
        }
        const keyInfo = await this.authService.verifyApiKey(apiKey);
        if (!keyInfo) {
            throw new common_1.UnauthorizedException({
                error: 'UNAUTHORIZED',
                code: 'INVALID_API_KEY',
                message: 'Invalid or revoked API key',
            });
        }
        if (keyInfo.ipWhitelist && keyInfo.ipWhitelist.length > 0) {
            const clientIp = request.ip || request.connection?.remoteAddress || '';
            const normalizedIp = clientIp.replace(/^::ffff:/, '');
            if (!keyInfo.ipWhitelist.includes(normalizedIp)) {
                throw new common_1.UnauthorizedException({
                    error: 'FORBIDDEN',
                    code: 'IP_NOT_ALLOWED',
                    message: 'Request IP not in whitelist for this API key',
                });
            }
        }
        const method = request.method;
        const path = request.originalUrl || request.url;
        const body = request.rawBody ? request.rawBody.toString() : '';
        const valid = this.authService.verifyHmacSignature({
            secret: apiKey,
            method,
            path,
            body,
            timestamp,
            signature,
        });
        if (!valid) {
            throw new common_1.UnauthorizedException({
                error: 'UNAUTHORIZED',
                code: 'INVALID_SIGNATURE',
                message: 'HMAC signature verification failed',
            });
        }
        const rateLimitPerMinute = this.configService.get('RATE_LIMIT_PER_MINUTE', 120);
        const rateLimitResult = await this.redisService.rateLimit(`ratelimit:apikey:${keyInfo.apiKeyId}`, rateLimitPerMinute, 60);
        const response = context.switchToHttp().getResponse();
        response.setHeader('X-RateLimit-Limit', rateLimitPerMinute);
        response.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
        response.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetAt / 1000));
        if (!rateLimitResult.allowed) {
            response.setHeader('Retry-After', 60);
            throw new common_1.UnauthorizedException({
                error: 'RATE_LIMITED',
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded',
            });
        }
        const requiredScopes = this.reflector.getAllAndOverride(exports.SCOPES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (requiredScopes && requiredScopes.length > 0) {
            const hasScope = requiredScopes.some((scope) => keyInfo.scopes.includes(scope));
            if (!hasScope) {
                throw new common_1.UnauthorizedException({
                    error: 'FORBIDDEN',
                    code: 'INSUFFICIENT_SCOPE',
                    message: 'API key lacks required scopes',
                });
            }
        }
        request.apiKeyId = keyInfo.apiKeyId;
        request.merchantId = keyInfo.merchantId;
        request.scopes = keyInfo.scopes;
        request.idempotencyKey = idempotencyKey;
        return true;
    }
};
exports.ApiKeyGuard = ApiKeyGuard;
exports.ApiKeyGuard = ApiKeyGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        redis_service_1.RedisService,
        config_1.ConfigService,
        core_1.Reflector])
], ApiKeyGuard);
//# sourceMappingURL=api-key.guard.js.map