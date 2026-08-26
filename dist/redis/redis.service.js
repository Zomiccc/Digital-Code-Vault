"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let RedisService = RedisService_1 = class RedisService {
    configService;
    logger = new common_1.Logger(RedisService_1.name);
    redisUrl;
    redis = null;
    connected = false;
    memStore = new Map();
    rateLimitStore = new Map();
    cleanupInterval;
    constructor(configService) {
        this.configService = configService;
        this.redisUrl = this.configService.get('REDIS_URL', 'redis://localhost:6379');
        this.initRedis();
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }
    async initRedis() {
        const redisUrl = this.redisUrl || '';
        const isDefaultLocal = redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1') || redisUrl.includes('::1');
        const explicitRedis = this.configService.get('REDIS_URL');
        if (!explicitRedis && isDefaultLocal) {
            this.logger.warn('No REDIS_URL configured. Using in-memory fallback.');
            this.connected = false;
            return;
        }
        try {
            const IORedis = (await Promise.resolve().then(() => __importStar(require('ioredis')))).default;
            let errorLogged = false;
            this.redis = new IORedis(this.redisUrl, {
                maxRetriesPerRequest: null,
                retryStrategy: () => null,
                enableOfflineQueue: false,
                autoResubscribe: false,
                lazyConnect: true,
            });
            this.redis.on('connect', () => {
                this.connected = true;
                this.logger.log('Redis connected');
            });
            this.redis.on('error', (err) => {
                this.connected = false;
                if (!errorLogged) {
                    this.logger.warn(`Redis unavailable: ${err.message}. Using in-memory fallback.`);
                    errorLogged = true;
                }
            });
            this.redis.on('close', () => {
                this.connected = false;
            });
            this.redis.connect().catch(() => {
                this.connected = false;
            });
        }
        catch {
            this.logger.warn('ioredis not available, using in-memory fallback store');
            this.connected = false;
        }
    }
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.memStore) {
            if (entry.expiresAt && entry.expiresAt < now) {
                this.memStore.delete(key);
            }
        }
    }
    async set(key, value, ttlSeconds) {
        if (this.connected && this.redis) {
            if (ttlSeconds) {
                await this.redis.set(key, value, 'EX', ttlSeconds);
            }
            else {
                await this.redis.set(key, value);
            }
            return;
        }
        this.memStore.set(key, {
            value,
            expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
        });
    }
    async get(key) {
        if (this.connected && this.redis) {
            return this.redis.get(key);
        }
        const entry = this.memStore.get(key);
        if (!entry)
            return null;
        if (entry.expiresAt && entry.expiresAt < Date.now()) {
            this.memStore.delete(key);
            return null;
        }
        return entry.value;
    }
    async del(key) {
        if (this.connected && this.redis) {
            await this.redis.del(key);
            return;
        }
        this.memStore.delete(key);
    }
    async exists(key) {
        if (this.connected && this.redis) {
            const result = await this.redis.exists(key);
            return result === 1;
        }
        const val = await this.get(key);
        return val !== null;
    }
    async setNx(key, value, ttlSeconds) {
        if (this.connected && this.redis) {
            const result = await this.redis.set(key, value, 'NX', 'EX', ttlSeconds);
            return result === 'OK';
        }
        const existing = await this.get(key);
        if (existing)
            return false;
        await this.set(key, value, ttlSeconds);
        return true;
    }
    async rateLimit(key, limit, windowSeconds) {
        const now = Date.now();
        const windowStart = now - windowSeconds * 1000;
        const rateLimitKey = `ratelimit:${key}`;
        if (this.connected && this.redis) {
            const pipe = this.redis.pipeline();
            pipe.zremrangebyscore(rateLimitKey, 0, windowStart);
            pipe.zadd(rateLimitKey, now, `${now}`);
            pipe.zcount(rateLimitKey, windowStart, now);
            pipe.pexpire(rateLimitKey, windowSeconds * 1000);
            const results = await pipe.exec();
            const count = results[2][1];
            const allowed = count <= limit;
            const remaining = Math.max(0, limit - count);
            const resetAt = now + windowSeconds * 1000;
            return { allowed, remaining, resetAt };
        }
        let entry = this.rateLimitStore.get(rateLimitKey);
        if (!entry) {
            entry = { timestamps: [] };
            this.rateLimitStore.set(rateLimitKey, entry);
        }
        entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
        entry.timestamps.push(now);
        const count = entry.timestamps.length;
        const allowed = count <= limit;
        const remaining = Math.max(0, limit - count);
        const resetAt = now + windowSeconds * 1000;
        return { allowed, remaining, resetAt };
    }
    async onModuleDestroy() {
        if (this.cleanupInterval)
            clearInterval(this.cleanupInterval);
        if (this.redis) {
            await this.redis.quit();
        }
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map