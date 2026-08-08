import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiKeyGuard } from './api-key.guard';

@Injectable()
export class CombinedAuthGuard extends AuthGuard(['admin-jwt', 'merchant-jwt']) {
  constructor(private apiKeyGuard: ApiKeyGuard) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      return super.canActivate(context) as Promise<boolean>;
    }

    const apiKey = request.headers['x-api-key'];
    if (apiKey) {
      return this.apiKeyGuard.canActivate(context) as Promise<boolean>;
    }

    throw new UnauthorizedException('Authentication required');
  }
}
