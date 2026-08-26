import { NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
export declare class SecurityHeadersMiddleware implements NestMiddleware {
    private configService;
    constructor(configService: ConfigService);
    use(req: Request, res: Response, next: NextFunction): void;
}
