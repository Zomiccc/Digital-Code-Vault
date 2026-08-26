import { ExecutionContext } from '@nestjs/common';
declare const CustomerAuthGuard_base: import("@nestjs/passport").Type<import("@nestjs/passport").IAuthGuard>;
export declare class CustomerAuthGuard extends CustomerAuthGuard_base {
    canActivate(context: ExecutionContext): boolean | Promise<boolean> | import("rxjs").Observable<boolean>;
}
export {};
