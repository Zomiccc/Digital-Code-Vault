import { Controller, Post, Body, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { MerchantAuthGuard } from './guards/merchant-auth.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AdminLoginDto, MerchantLoginDto, MerchantRegisterDto, CustomerRegisterDto, CustomerLoginDto, RefreshTokenDto } from '../dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard)
  async adminLogin(@Body() body: AdminLoginDto, @Req() req: any) {
    return this.authService.adminLogin(body.email, body.password, req.ip);
  }

  @Post('admin/refresh')
  @HttpCode(HttpStatus.OK)
  async adminRefresh(@Body() body: RefreshTokenDto) {
    return this.authService.adminRefresh(body.refresh_token);
  }

  @Post('merchant/login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard)
  async merchantLogin(@Body() body: MerchantLoginDto, @Req() req: any) {
    return this.authService.merchantLogin(body.email, body.password, req.ip);
  }

  @Post('merchant/register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(LoginRateLimitGuard)
  async merchantRegister(@Body() body: MerchantRegisterDto, @Req() req: any) {
    return this.authService.merchantRegister(body, req.ip);
  }

  @Post('merchant/refresh')
  @HttpCode(HttpStatus.OK)
  async merchantRefresh(@Body() body: RefreshTokenDto) {
    return this.authService.merchantRefresh(body.refresh_token);
  }

  // ─── Customer Auth ───

  @Post('customer/register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(LoginRateLimitGuard)
  async customerRegister(@Body() body: CustomerRegisterDto, @Req() req: any) {
    return this.authService.customerRegister(body, req.ip);
  }

  @Post('customer/login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard)
  async customerLogin(@Body() body: CustomerLoginDto, @Req() req: any) {
    return this.authService.customerLogin(body.email, body.password, req.ip);
  }

  @Post('customer/refresh')
  @HttpCode(HttpStatus.OK)
  async customerRefresh(@Body() body: RefreshTokenDto) {
    return this.authService.customerRefresh(body.refresh_token);
  }

  @Post('customer/request-code')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard)
  async requestCustomerCode(@Body() body: { email: string }) {
    return this.authService.requestCustomerVerificationCode(body.email);
  }

  @Post('customer/login-with-code')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard)
  async customerLoginWithCode(@Body() body: { email: string; code: string }, @Req() req: any) {
    return this.authService.verifyCustomerCodeAndLogin(body.email, body.code, req.ip);
  }
}
