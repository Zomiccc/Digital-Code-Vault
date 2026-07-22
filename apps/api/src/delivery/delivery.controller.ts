import { Controller, Get, Post, Param, Req, NotFoundException, BadRequestException } from '@nestjs/common';
import { DeliveryService } from './delivery.service';

// This controller handles the /d/:token routes
// It's NOT under the /api/v1 prefix — it's a separate route
@Controller('d')
export class DeliveryController {
  constructor(private deliveryService: DeliveryService) {}

  @Get(':token')
  async getDeliveryInfo(@Param('token') token: string) {
    return this.deliveryService.getDeliveryInfo(token);
  }

  @Post(':token/reveal')
  async revealCode(@Param('token') token: string, @Req() req: any) {
    return this.deliveryService.revealCode(token, req.ip);
  }
}
