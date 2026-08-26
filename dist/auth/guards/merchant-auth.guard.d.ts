import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class MerchantAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}
