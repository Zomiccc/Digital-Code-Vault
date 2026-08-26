"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogController = void 0;
const common_1 = require("@nestjs/common");
const catalog_service_1 = require("./catalog.service");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const admin_auth_guard_1 = require("../auth/guards/admin-auth.guard");
const dto_1 = require("../dto");
let CatalogController = class CatalogController {
    catalogService;
    constructor(catalogService) {
        this.catalogService = catalogService;
    }
    async listBrands(active) {
        return this.catalogService.listBrands(active === 'true');
    }
    async getBrand(id) {
        return this.catalogService.getBrand(id);
    }
    async createBrand(body, user) {
        return this.catalogService.createBrand(body, user.id);
    }
    async updateBrand(id, body, user) {
        return this.catalogService.updateBrand(id, body, user.id);
    }
    async deleteBrand(id, user) {
        return this.catalogService.deleteBrand(id, user.id);
    }
    async listCategories(active) {
        return this.catalogService.listCategories(active === 'true');
    }
    async getCategory(id) {
        return this.catalogService.getCategory(id);
    }
    async createCategory(body, user) {
        return this.catalogService.createCategory(body, user.id);
    }
    async updateCategory(id, body, user) {
        return this.catalogService.updateCategory(id, body, user.id);
    }
    async deleteCategory(id, user) {
        return this.catalogService.deleteCategory(id, user.id);
    }
    async listRegions(active) {
        return this.catalogService.listRegions(active === 'true');
    }
    async createRegion(body, user) {
        return this.catalogService.createRegion(body, user.id);
    }
    async updateRegion(id, body, user) {
        return this.catalogService.updateRegion(id, body, user.id);
    }
    async deleteRegion(id, user) {
        return this.catalogService.deleteRegion(id, user.id);
    }
    async listProductRegions(productId) {
        return this.catalogService.listProductRegions(productId);
    }
    async createProductRegion(body, user) {
        return this.catalogService.createProductRegion(body, user.id);
    }
    async deleteProductRegion(id, user) {
        return this.catalogService.deleteProductRegion(id, user.id);
    }
    async listVariants(productRegionId, productId) {
        if (productId)
            return this.catalogService.listVariantsByProduct(productId);
        return this.catalogService.listVariants(productRegionId);
    }
    async listVariantsByProduct(productId) {
        return this.catalogService.listVariantsByProduct(productId);
    }
    async createVariantForProduct(productId, body, user) {
        return this.catalogService.createVariantForProduct(productId, body, user.id);
    }
    async createVariant(body, user) {
        return this.catalogService.createVariant(body, user.id);
    }
    async updateVariant(id, body, user) {
        return this.catalogService.updateVariant(id, body, user.id);
    }
    async deleteVariant(id, user) {
        return this.catalogService.deleteVariant(id, user.id);
    }
    async listCombinations(variantId, active) {
        return this.catalogService.listCombinations(variantId, active === 'true');
    }
    async createCombination(body, user) {
        return this.catalogService.createCombination(body, user.id);
    }
    async updateCombination(id, body, user) {
        return this.catalogService.updateCombination(id, body, user.id);
    }
    async deleteCombination(id, user) {
        return this.catalogService.deleteCombination(id, user.id);
    }
    async getCombinationAvailability(id) {
        return this.catalogService.getCombinationAvailability(id);
    }
    async getCatalogHierarchy() {
        return this.catalogService.getCatalogHierarchy();
    }
    async getCatalogStats() {
        return this.catalogService.getCatalogStats();
    }
};
exports.CatalogController = CatalogController;
__decorate([
    (0, common_1.Get)('brands'),
    __param(0, (0, common_1.Query)('active')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "listBrands", null);
__decorate([
    (0, common_1.Get)('brands/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "getBrand", null);
__decorate([
    (0, common_1.Post)('brands'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "createBrand", null);
__decorate([
    (0, common_1.Patch)('brands/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "updateBrand", null);
__decorate([
    (0, common_1.Delete)('brands/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "deleteBrand", null);
__decorate([
    (0, common_1.Get)('categories'),
    __param(0, (0, common_1.Query)('active')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "listCategories", null);
__decorate([
    (0, common_1.Get)('categories/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "getCategory", null);
__decorate([
    (0, common_1.Post)('categories'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateCategoryDto, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Patch)('categories/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateCategoryDto, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "updateCategory", null);
__decorate([
    (0, common_1.Delete)('categories/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "deleteCategory", null);
__decorate([
    (0, common_1.Get)('regions'),
    __param(0, (0, common_1.Query)('active')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "listRegions", null);
__decorate([
    (0, common_1.Post)('regions'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateRegionDto, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "createRegion", null);
__decorate([
    (0, common_1.Patch)('regions/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateRegionDto, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "updateRegion", null);
__decorate([
    (0, common_1.Delete)('regions/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "deleteRegion", null);
__decorate([
    (0, common_1.Get)('product-regions'),
    __param(0, (0, common_1.Query)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "listProductRegions", null);
__decorate([
    (0, common_1.Post)('product-regions'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateProductRegionDto, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "createProductRegion", null);
__decorate([
    (0, common_1.Delete)('product-regions/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "deleteProductRegion", null);
__decorate([
    (0, common_1.Get)('variants'),
    __param(0, (0, common_1.Query)('productRegionId')),
    __param(1, (0, common_1.Query)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "listVariants", null);
__decorate([
    (0, common_1.Get)('products/:productId/variants'),
    __param(0, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "listVariantsByProduct", null);
__decorate([
    (0, common_1.Post)('products/:productId/variants'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('productId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "createVariantForProduct", null);
__decorate([
    (0, common_1.Post)('variants'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateVariantDto, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "createVariant", null);
__decorate([
    (0, common_1.Patch)('variants/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateVariantDto, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "updateVariant", null);
__decorate([
    (0, common_1.Delete)('variants/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "deleteVariant", null);
__decorate([
    (0, common_1.Get)('combinations'),
    __param(0, (0, common_1.Query)('variantId')),
    __param(1, (0, common_1.Query)('active')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "listCombinations", null);
__decorate([
    (0, common_1.Post)('combinations'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateCombinationDto, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "createCombination", null);
__decorate([
    (0, common_1.Patch)('combinations/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateCombinationDto, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "updateCombination", null);
__decorate([
    (0, common_1.Delete)('combinations/:id'),
    (0, roles_decorator_1.Roles)('SUPER_ADMIN', 'INVENTORY_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "deleteCombination", null);
__decorate([
    (0, common_1.Get)('combinations/:id/availability'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "getCombinationAvailability", null);
__decorate([
    (0, common_1.Get)('hierarchy'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "getCatalogHierarchy", null);
__decorate([
    (0, common_1.Get)('stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "getCatalogStats", null);
exports.CatalogController = CatalogController = __decorate([
    (0, common_1.Controller)('admin/catalog'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_auth_guard_1.AdminAuthGuard),
    __metadata("design:paramtypes", [catalog_service_1.CatalogService])
], CatalogController);
//# sourceMappingURL=catalog.controller.js.map