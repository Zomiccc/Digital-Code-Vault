import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface MerchantJwtPayload {
  sub: string;
  email: string;
  merchantId: string;
  type: string;
}

@Injectable()
export class MerchantJwtStrategy extends PassportStrategy(Strategy, 'merchant-jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'dev-only-insecure-secret',
    });
  }

  async validate(payload: MerchantJwtPayload) {
    if (payload.type !== 'merchant') {
      return null;
    }
    const user = await this.prisma.merchantUser.findUnique({
      where: { id: payload.sub },
      include: { merchant: true },
    });
    if (!user || !user.isActive || user.merchant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account disabled');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      merchantId: user.merchantId,
      merchant: user.merchant,
    };
  }
}
