import { ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
declare const CombinedAuthGuard_base: import("@nestjs/passport").Type<import("@nestjs/passport").IAuthGuard>;
export declare class CombinedAuthGuard extends CombinedAuthGuard_base {
    private apiKeyGuard;
    constructor(apiKeyGuard: ApiKeyGuard);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export {};
