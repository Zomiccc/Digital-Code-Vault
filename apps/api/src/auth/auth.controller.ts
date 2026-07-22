import { Controller, Post, Body, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { MerchantAuthGuard } from './guards/merchant-auth.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard)
  async adminLogin(@Body() body: { email: string; password: string }, @Req() req: any) {
    return this.authService.adminLogin(body.email, body.password, req.ip);
  }

  @Post('admin/refresh')
  @HttpCode(HttpStatus.OK)
  async adminRefresh(@Body() body: { refresh_token: string }) {
    return this.authService.adminRefresh(body.refresh_token);
  }

  @Post('merchant/login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard)
  async merchantLogin(@Body() body: { email: string; password: string }, @Req() req: any) {
    return this.authService.merchantLogin(body.email, body.password, req.ip);
  }

  @Post('merchant/refresh')
  @HttpCode(HttpStatus.OK)
  async merchantRefresh(@Body() body: { refresh_token: string }) {
    return this.authService.merchantRefresh(body.refresh_token);
  }
}
