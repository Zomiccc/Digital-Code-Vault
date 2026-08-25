import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, Req,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateRegionDto, UpdateRegionDto,
  CreateProductRegionDto,
  CreateVariantDto, UpdateVariantDto,
  CreateCombinationDto, UpdateCombinationDto,
} from '../dto';

@Controller('admin/catalog')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  // ─── Brands ───

  @Get('brands')
  async listBrands(@Query('active') active?: string) {
    return this.catalogService.listBrands(active === 'true');
  }

  @Get('brands/:id')
  async getBrand(@Param('id') id: string) {
    return this.catalogService.getBrand(id);
  }

  @Post('brands')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createBrand(@Body() body: { name: string; slug?: string; description?: string; image?: string; sortOrder?: number }, @CurrentUser() user: any) {
    return this.catalogService.createBrand(body, user.id);
  }

  @Patch('brands/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async updateBrand(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.catalogService.updateBrand(id, body, user.id);
  }

  @Delete('brands/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async deleteBrand(@Param('id') id: string, @CurrentUser() user: any) {
    return this.catalogService.deleteBrand(id, user.id);
  }

  // ─── Categories ───

  @Get('categories')
  async listCategories(@Query('active') active?: string) {
    return this.catalogService.listCategories(active === 'true');
  }

  @Get('categories/:id')
  async getCategory(@Param('id') id: string) {
    return this.catalogService.getCategory(id);
  }

  @Post('categories')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createCategory(@Body() body: CreateCategoryDto, @CurrentUser() user: any) {
    return this.catalogService.createCategory(body, user.id);
  }

  @Patch('categories/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async updateCategory(@Param('id') id: string, @Body() body: UpdateCategoryDto, @CurrentUser() user: any) {
    return this.catalogService.updateCategory(id, body, user.id);
  }

  @Delete('categories/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async deleteCategory(@Param('id') id: string, @CurrentUser() user: any) {
    return this.catalogService.deleteCategory(id, user.id);
  }

  // ─── Regions ───

  @Get('regions')
  async listRegions(@Query('active') active?: string) {
    return this.catalogService.listRegions(active === 'true');
  }

  @Post('regions')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createRegion(@Body() body: CreateRegionDto, @CurrentUser() user: any) {
    return this.catalogService.createRegion(body, user.id);
  }

  @Patch('regions/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async updateRegion(@Param('id') id: string, @Body() body: UpdateRegionDto, @CurrentUser() user: any) {
    return this.catalogService.updateRegion(id, body, user.id);
  }

  @Delete('regions/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async deleteRegion(@Param('id') id: string, @CurrentUser() user: any) {
    return this.catalogService.deleteRegion(id, user.id);
  }

  // ─── Product Regions ───

  @Get('product-regions')
  async listProductRegions(@Query('productId') productId?: string) {
    return this.catalogService.listProductRegions(productId);
  }

  @Post('product-regions')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createProductRegion(@Body() body: CreateProductRegionDto, @CurrentUser() user: any) {
    return this.catalogService.createProductRegion(body, user.id);
  }

  @Delete('product-regions/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async deleteProductRegion(@Param('id') id: string, @CurrentUser() user: any) {
    return this.catalogService.deleteProductRegion(id, user.id);
  }

  // ─── Variants ───

  @Get('variants')
  async listVariants(@Query('productRegionId') productRegionId?: string, @Query('productId') productId?: string) {
    if (productId) return this.catalogService.listVariantsByProduct(productId);
    return this.catalogService.listVariants(productRegionId);
  }

  @Get('products/:productId/variants')
  async listVariantsByProduct(@Param('productId') productId: string) {
    return this.catalogService.listVariantsByProduct(productId);
  }

  @Post('products/:productId/variants')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createVariantForProduct(@Param('productId') productId: string, @Body() body: { name: string; customerPrice: number; description?: string; currency?: string }, @CurrentUser() user: any) {
    return this.catalogService.createVariantForProduct(productId, body, user.id);
  }

  @Post('variants')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createVariant(@Body() body: CreateVariantDto, @CurrentUser() user: any) {
    return this.catalogService.createVariant(body, user.id);
  }

  @Patch('variants/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async updateVariant(@Param('id') id: string, @Body() body: UpdateVariantDto, @CurrentUser() user: any) {
    return this.catalogService.updateVariant(id, body, user.id);
  }

  @Delete('variants/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async deleteVariant(@Param('id') id: string, @CurrentUser() user: any) {
    return this.catalogService.deleteVariant(id, user.id);
  }

  // ─── Combinations ───

  @Get('combinations')
  async listCombinations(
    @Query('variantId') variantId?: string,
    @Query('active') active?: string,
  ) {
    return this.catalogService.listCombinations(variantId, active === 'true');
  }

  @Post('combinations')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async createCombination(@Body() body: CreateCombinationDto, @CurrentUser() user: any) {
    return this.catalogService.createCombination(body, user.id);
  }

  @Patch('combinations/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async updateCombination(@Param('id') id: string, @Body() body: UpdateCombinationDto, @CurrentUser() user: any) {
    return this.catalogService.updateCombination(id, body, user.id);
  }

  @Delete('combinations/:id')
  @Roles('SUPER_ADMIN', 'INVENTORY_MANAGER')
  async deleteCombination(@Param('id') id: string, @CurrentUser() user: any) {
    return this.catalogService.deleteCombination(id, user.id);
  }

  @Get('combinations/:id/availability')
  async getCombinationAvailability(@Param('id') id: string) {
    return this.catalogService.getCombinationAvailability(id);
  }

  // ─── Catalog Hierarchy ───

  @Get('hierarchy')
  async getCatalogHierarchy() {
    return this.catalogService.getCatalogHierarchy();
  }

  // ─── Stats ───

  @Get('stats')
  async getCatalogStats() {
    return this.catalogService.getCatalogStats();
  }
}
