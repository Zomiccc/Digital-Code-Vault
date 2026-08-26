import { CanActivate, ExecutionContext } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
export declare class LoginRateLimitGuard implements CanActivate {
    private redisService;
    constructor(redisService: RedisService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
