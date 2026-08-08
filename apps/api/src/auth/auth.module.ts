import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { MerchantJwtStrategy } from './strategies/merchant-jwt.strategy';
import { CustomerJwtStrategy } from './strategies/customer-jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CombinedAuthGuard } from './guards/combined-auth.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change-me-in-production'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    EmailModule,
  ],
  providers: [AuthService, AdminJwtStrategy, MerchantJwtStrategy, CustomerJwtStrategy, JwtAuthGuard, CombinedAuthGuard, LoginRateLimitGuard, AdminBootstrapService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, JwtAuthGuard, CombinedAuthGuard],
})
export class AuthModule {}
