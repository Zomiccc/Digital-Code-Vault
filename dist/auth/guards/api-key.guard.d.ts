import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '@nestjs/config';
export declare const SCOPES_KEY = "scopes";
export declare class ApiKeyGuard implements CanActivate {
    private authService;
    private redisService;
    private configService;
    private reflector;
    constructor(authService: AuthService, redisService: RedisService, configService: ConfigService, reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
