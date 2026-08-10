import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface CustomerJwtPayload {
  sub: string;
  email: string;
  type: string;
}

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
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

  async validate(payload: CustomerJwtPayload) {
    if (payload.type !== 'customer') {
      return null;
    }
    const customer = await this.prisma.customer.findUnique({
      where: { id: payload.sub },
    });
    if (!customer || !customer.isActive) {
      throw new UnauthorizedException('Account disabled');
    }
    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      merchantId: customer.merchantId,
    };
  }
}
