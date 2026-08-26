import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
export declare class HealthController {
    private prisma;
    private redisService;
    constructor(prisma: PrismaService, redisService: RedisService);
    check(): Promise<{
        status: string;
        checks: Record<string, string>;
        timestamp: string;
    }>;
}
