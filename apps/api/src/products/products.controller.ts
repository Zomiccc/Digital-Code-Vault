import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async listProducts(@Req() req: any) {
    return this.productsService.listProductsForMerchant(req.user.merchantId);
  }

  @Get(':id/denominations')
  @UseGuards(JwtAuthGuard)
  async getDenominations(@Param('id') id: string) {
    return this.productsService.getDenominations(id);
  }
}
