import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard(['admin-jwt', 'merchant-jwt']) {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
