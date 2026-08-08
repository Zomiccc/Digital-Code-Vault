import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RateLimitEntry {
  timestamps: number[];
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redisUrl: string;
  private redis: any = null;
  private connected = false;

  // Fallback in-memory stores
  private readonly memStore = new Map<string, { value: string; expiresAt?: number }>();
  private readonly rateLimitStore = new Map<string, RateLimitEntry>();
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(private configService: ConfigService) {
    this.redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.initRedis();

    // Periodic cleanup of expired in-memory keys
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private async initRedis() {
    const redisUrl = this.redisUrl || '';
    const isDefaultLocal = redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1') || redisUrl.includes('::1');

    // Skip Redis entirely if using default localhost and no REDIS_URL explicitly set
    const explicitRedis = this.configService.get<string>('REDIS_URL');
    if (!explicitRedis && isDefaultLocal) {
      this.logger.warn('No REDIS_URL configured. Using in-memory fallback.');
      this.connected = false;
      return;
    }

    try {
      const IORedis = (await import('ioredis')).default;
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

      this.redis.on('error', (err: Error) => {
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
    } catch {
      this.logger.warn('ioredis not available, using in-memory fallback store');
      this.connected = false;
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.memStore) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.memStore.delete(key);
      }
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.connected && this.redis) {
      if (ttlSeconds) {
        await this.redis.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, value);
      }
      return;
    }
    this.memStore.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async get(key: string): Promise<string | null> {
    if (this.connected && this.redis) {
      return this.redis.get(key);
    }
    const entry = this.memStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.memStore.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<void> {
    if (this.connected && this.redis) {
      await this.redis.del(key);
      return;
    }
    this.memStore.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    if (this.connected && this.redis) {
      const result = await this.redis.exists(key);
      return result === 1;
    }
    const val = await this.get(key);
    return val !== null;
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.connected && this.redis) {
      const result = await this.redis.set(key, value, 'NX', 'EX', ttlSeconds);
      return result === 'OK';
    }
    const existing = await this.get(key);
    if (existing) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async rateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
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
      const count = results[2][1] as number;
      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      const resetAt = now + windowSeconds * 1000;
      return { allowed, remaining, resetAt };
    }

    // In-memory fallback
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
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
