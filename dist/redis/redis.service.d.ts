import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class RedisService implements OnModuleDestroy {
    private configService;
    private readonly logger;
    private readonly redisUrl;
    private redis;
    private connected;
    private readonly memStore;
    private readonly rateLimitStore;
    private cleanupInterval?;
    constructor(configService: ConfigService);
    private initRedis;
    private cleanup;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
    rateLimit(key: string, limit: number, windowSeconds: number): Promise<{
        allowed: boolean;
        remaining: number;
        resetAt: number;
    }>;
    onModuleDestroy(): Promise<void>;
}
