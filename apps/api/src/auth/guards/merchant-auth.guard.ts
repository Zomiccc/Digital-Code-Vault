import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * Requires a token that actually belongs to a merchant.
 *
 * JwtAuthGuard accepts admin, merchant and customer tokens alike, so an admin
 * token passed the guard on merchant endpoints and left `merchantId` undefined.
 * Every handler then queried `where: { id: undefined }`, which Prisma rejects —
 * so the whole merchant dashboard answered 500 instead of saying the session was
 * wrong for it.
 *
 * Unauthorized rather than Forbidden because the caller needs to authenticate
 * *as a merchant*: the admin client treats 401 as "re-authenticate", which is
 * the correct outcome, whereas 403 would surface as an unexplained error.
 */
@Injectable()
export class MerchantAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (!user?.merchantId) {
      throw new UnauthorizedException({
        error: 'MERCHANT_SESSION_REQUIRED',
        code: 'MERCHANT_SESSION_REQUIRED',
        message: 'This page needs a merchant login. Sign in with a merchant account to continue.',
      });
    }
    return true;
  }
}
