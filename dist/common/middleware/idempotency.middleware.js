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
exports.IdempotencyMiddleware = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../redis/redis.service");
const config_1 = require("@nestjs/config");
let IdempotencyMiddleware = class IdempotencyMiddleware {
    redisService;
    configService;
    constructor(redisService, configService) {
        this.redisService = redisService;
        this.configService = configService;
    }
    async use(req, res, next) {
        if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
            return next();
        }
        const idempotencyKey = req.headers['idempotency-key'];
        const merchantId = req.merchantId;
        if (!idempotencyKey) {
            return next();
        }
        if (!merchantId) {
            return next();
        }
        const redisKey = `idempotency:${merchantId}:${idempotencyKey}`;
        const cached = await this.redisService.get(redisKey);
        if (cached) {
            const cachedResponse = JSON.parse(cached);
            return res.status(cachedResponse.status).json(cachedResponse.body);
        }
        const originalSend = res.json.bind(res);
        const ttlMs = this.configService.get('IDEMPOTENCY_KEY_TTL_MS', 86400000);
        const ttlSeconds = Math.floor(ttlMs / 1000);
        res.json = (body) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const responseToCache = JSON.stringify({
                    status: res.statusCode,
                    body,
                });
                this.redisService.set(redisKey, responseToCache, ttlSeconds).catch(() => {
                });
            }
            return originalSend(body);
        };
        next();
    }
};
exports.IdempotencyMiddleware = IdempotencyMiddleware;
exports.IdempotencyMiddleware = IdempotencyMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        config_1.ConfigService])
], IdempotencyMiddleware);
//# sourceMappingURL=idempotency.middleware.js.map