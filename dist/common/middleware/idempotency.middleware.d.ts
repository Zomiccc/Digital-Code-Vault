import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '@nestjs/config';
export declare class IdempotencyMiddleware implements NestMiddleware {
    private redisService;
    private configService;
    constructor(redisService: RedisService, configService: ConfigService);
    use(req: Request & {
        idempotencyKey?: string;
        merchantId?: string;
    }, res: Response, next: NextFunction): Promise<void>;
}
