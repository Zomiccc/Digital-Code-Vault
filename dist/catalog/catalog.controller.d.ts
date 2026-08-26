import { CatalogService } from './catalog.service';
import { CreateCategoryDto, UpdateCategoryDto, CreateRegionDto, UpdateRegionDto, CreateProductRegionDto, CreateVariantDto, UpdateVariantDto, CreateCombinationDto, UpdateCombinationDto } from '../dto';
export declare class CatalogController {
    private catalogService;
    constructor(catalogService: CatalogService);
    listBrands(active?: string): Promise<({
        _count: {
            categories: number;
        };
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        active: boolean;
        slug: string;
        sortOrder: number;
    })[]>;
    getBrand(id: string): Promise<{
        categories: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            description: string | null;
            image: string | null;
            active: boolean;
            slug: string;
            brandId: string | null;
            sortOrder: number;
        }[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        active: boolean;
        slug: string;
        sortOrder: number;
    }>;
    createBrand(body: {
        name: string;
        slug?: string;
        description?: string;
        image?: string;
        sortOrder?: number;
    }, user: any): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        active: boolean;
        slug: string;
        sortOrder: number;
    }>;
    updateBrand(id: string, body: any, user: any): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        active: boolean;
        slug: string;
        sortOrder: number;
    }>;
    deleteBrand(id: string, user: any): Promise<{
        id: string;
        deactivated: boolean;
    }>;
    listCategories(active?: string): Promise<({
        brand: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            description: string | null;
            image: string | null;
            active: boolean;
            slug: string;
            sortOrder: number;
        } | null;
        _count: {
            products: number;
        };
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        active: boolean;
        slug: string;
        brandId: string | null;
        sortOrder: number;
    })[]>;
    getCategory(id: string): Promise<{
        products: {
            region: string;
            id: string;
            createdAt: Date;
            name: string;
            merchantId: string | null;
            status: string;
            updatedAt: Date;
            productType: string;
            categoryId: string | null;
            supplierId: string | null;
        }[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        active: boolean;
        slug: string;
        brandId: string | null;
        sortOrder: number;
    }>;
    createCategory(body: CreateCategoryDto, user: any): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        active: boolean;
        slug: string;
        brandId: string | null;
        sortOrder: number;
    }>;
    updateCategory(id: string, body: UpdateCategoryDto, user: any): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        active: boolean;
        slug: string;
        brandId: string | null;
        sortOrder: number;
    }>;
    deleteCategory(id: string, user: any): Promise<{
        id: string;
        deactivated: boolean;
    }>;
    listRegions(active?: string): Promise<{
        symbol: string;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        currency: string;
        code: string;
        active: boolean;
    }[]>;
    createRegion(body: CreateRegionDto, user: any): Promise<{
        symbol: string;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        currency: string;
        code: string;
        active: boolean;
    }>;
    updateRegion(id: string, body: UpdateRegionDto, user: any): Promise<{
        symbol: string;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        currency: string;
        code: string;
        active: boolean;
    }>;
    deleteRegion(id: string, user: any): Promise<{
        id: string;
        deactivated: boolean;
    }>;
    listProductRegions(productId?: string): Promise<({
        region: {
            symbol: string;
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            currency: string;
            code: string;
            active: boolean;
        };
        product: {
            region: string;
            id: string;
            createdAt: Date;
            name: string;
            merchantId: string | null;
            status: string;
            updatedAt: Date;
            productType: string;
            categoryId: string | null;
            supplierId: string | null;
        };
        variants: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            currency: string;
            description: string | null;
            active: boolean;
            slug: string;
            sortOrder: number;
            productRegionId: string;
            customerPrice: import("@prisma/client/runtime/library").Decimal;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        productId: string;
        active: boolean;
        regionId: string;
    })[]>;
    createProductRegion(body: CreateProductRegionDto, user: any): Promise<{
        region: {
            symbol: string;
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            currency: string;
            code: string;
            active: boolean;
        };
        product: {
            region: string;
            id: string;
            createdAt: Date;
            name: string;
            merchantId: string | null;
            status: string;
            updatedAt: Date;
            productType: string;
            categoryId: string | null;
            supplierId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        productId: string;
        active: boolean;
        regionId: string;
    }>;
    deleteProductRegion(id: string, user: any): Promise<{
        id: string;
        deleted: boolean;
    }>;
    listVariants(productRegionId?: string, productId?: string): Promise<({
        productRegion: {
            region: {
                symbol: string;
                id: string;
                createdAt: Date;
                name: string;
                updatedAt: Date;
                currency: string;
                code: string;
                active: boolean;
            };
            product: {
                region: string;
                id: string;
                createdAt: Date;
                name: string;
                merchantId: string | null;
                status: string;
                updatedAt: Date;
                productType: string;
                categoryId: string | null;
                supplierId: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            productId: string;
            active: boolean;
            regionId: string;
        };
        combinations: ({
            items: ({
                denomination: {
                    id: string;
                    createdAt: Date;
                    currency: string;
                    productId: string;
                    faceValue: import("@prisma/client/runtime/library").Decimal;
                };
            } & {
                id: string;
                createdAt: Date;
                denominationId: string;
                combinationId: string;
                quantity: number;
            })[];
        } & {
            id: string;
            createdAt: Date;
            name: string;
            priority: number;
            updatedAt: Date;
            variantId: string;
            active: boolean;
        })[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        currency: string;
        description: string | null;
        active: boolean;
        slug: string;
        sortOrder: number;
        productRegionId: string;
        customerPrice: import("@prisma/client/runtime/library").Decimal;
    })[]>;
    listVariantsByProduct(productId: string): Promise<({
        productRegion: {
            region: {
                symbol: string;
                id: string;
                createdAt: Date;
                name: string;
                updatedAt: Date;
                currency: string;
                code: string;
                active: boolean;
            };
            product: {
                region: string;
                id: string;
                createdAt: Date;
                name: string;
                merchantId: string | null;
                status: string;
                updatedAt: Date;
                productType: string;
                categoryId: string | null;
                supplierId: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            productId: string;
            active: boolean;
            regionId: string;
        };
        combinations: ({
            items: ({
                denomination: {
                    id: string;
                    createdAt: Date;
                    currency: string;
                    productId: string;
                    faceValue: import("@prisma/client/runtime/library").Decimal;
                };
            } & {
                id: string;
                createdAt: Date;
                denominationId: string;
                combinationId: string;
                quantity: number;
            })[];
        } & {
            id: string;
            createdAt: Date;
            name: string;
            priority: number;
            updatedAt: Date;
            variantId: string;
            active: boolean;
        })[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        currency: string;
        description: string | null;
        active: boolean;
        slug: string;
        sortOrder: number;
        productRegionId: string;
        customerPrice: import("@prisma/client/runtime/library").Decimal;
    })[]>;
    createVariantForProduct(productId: string, body: {
        name: string;
        customerPrice: number;
        description?: string;
        currency?: string;
    }, user: any): Promise<{
        productRegion: {
            region: {
                symbol: string;
                id: string;
                createdAt: Date;
                name: string;
                updatedAt: Date;
                currency: string;
                code: string;
                active: boolean;
            };
            product: {
                region: string;
                id: string;
                createdAt: Date;
                name: string;
                merchantId: string | null;
                status: string;
                updatedAt: Date;
                productType: string;
                categoryId: string | null;
                supplierId: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            productId: string;
            active: boolean;
            regionId: string;
        };
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        currency: string;
        description: string | null;
        active: boolean;
        slug: string;
        sortOrder: number;
        productRegionId: string;
        customerPrice: import("@prisma/client/runtime/library").Decimal;
    }>;
    createVariant(body: CreateVariantDto, user: any): Promise<{
        productRegion: {
            region: {
                symbol: string;
                id: string;
                createdAt: Date;
                name: string;
                updatedAt: Date;
                currency: string;
                code: string;
                active: boolean;
            };
            product: {
                region: string;
                id: string;
                createdAt: Date;
                name: string;
                merchantId: string | null;
                status: string;
                updatedAt: Date;
                productType: string;
                categoryId: string | null;
                supplierId: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            productId: string;
            active: boolean;
            regionId: string;
        };
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        currency: string;
        description: string | null;
        active: boolean;
        slug: string;
        sortOrder: number;
        productRegionId: string;
        customerPrice: import("@prisma/client/runtime/library").Decimal;
    }>;
    updateVariant(id: string, body: UpdateVariantDto, user: any): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        currency: string;
        description: string | null;
        active: boolean;
        slug: string;
        sortOrder: number;
        productRegionId: string;
        customerPrice: import("@prisma/client/runtime/library").Decimal;
    }>;
    deleteVariant(id: string, user: any): Promise<{
        id: string;
        deactivated: boolean;
    }>;
    listCombinations(variantId?: string, active?: string): Promise<{
        fulfillable: boolean;
        totalValue: number;
        variant: {
            productRegion: {
                region: {
                    symbol: string;
                    id: string;
                    createdAt: Date;
                    name: string;
                    updatedAt: Date;
                    currency: string;
                    code: string;
                    active: boolean;
                };
                product: {
                    region: string;
                    id: string;
                    createdAt: Date;
                    name: string;
                    merchantId: string | null;
                    status: string;
                    updatedAt: Date;
                    productType: string;
                    categoryId: string | null;
                    supplierId: string | null;
                };
            } & {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                productId: string;
                active: boolean;
                regionId: string;
            };
        } & {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            currency: string;
            description: string | null;
            active: boolean;
            slug: string;
            sortOrder: number;
            productRegionId: string;
            customerPrice: import("@prisma/client/runtime/library").Decimal;
        };
        items: ({
            denomination: {
                id: string;
                createdAt: Date;
                currency: string;
                productId: string;
                faceValue: import("@prisma/client/runtime/library").Decimal;
            };
        } & {
            id: string;
            createdAt: Date;
            denominationId: string;
            combinationId: string;
            quantity: number;
        })[];
        id: string;
        createdAt: Date;
        name: string;
        priority: number;
        updatedAt: Date;
        variantId: string;
        active: boolean;
    }[]>;
    createCombination(body: CreateCombinationDto, user: any): Promise<{
        items: ({
            denomination: {
                id: string;
                createdAt: Date;
                currency: string;
                productId: string;
                faceValue: import("@prisma/client/runtime/library").Decimal;
            };
        } & {
            id: string;
            createdAt: Date;
            denominationId: string;
            combinationId: string;
            quantity: number;
        })[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        priority: number;
        updatedAt: Date;
        variantId: string;
        active: boolean;
    }>;
    updateCombination(id: string, body: UpdateCombinationDto, user: any): Promise<{
        items: ({
            denomination: {
                id: string;
                createdAt: Date;
                currency: string;
                productId: string;
                faceValue: import("@prisma/client/runtime/library").Decimal;
            };
        } & {
            id: string;
            createdAt: Date;
            denominationId: string;
            combinationId: string;
            quantity: number;
        })[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        priority: number;
        updatedAt: Date;
        variantId: string;
        active: boolean;
    }>;
    deleteCombination(id: string, user: any): Promise<{
        id: string;
        deactivated: boolean;
    }>;
    getCombinationAvailability(id: string): Promise<{
        combinationId: string;
        name: string;
        active: boolean;
        priority: number;
        items: {
            denominationId: string;
            faceValue: number;
            required: number;
            available: number;
            sufficient: boolean;
        }[];
        fulfillable: boolean;
        totalValue: number;
    }>;
    getCatalogHierarchy(): Promise<({
        brand: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            description: string | null;
            image: string | null;
            active: boolean;
            slug: string;
            sortOrder: number;
        } | null;
        products: ({
            denominations: {
                id: string;
                createdAt: Date;
                currency: string;
                productId: string;
                faceValue: import("@prisma/client/runtime/library").Decimal;
            }[];
            productRegions: ({
                region: {
                    symbol: string;
                    id: string;
                    createdAt: Date;
                    name: string;
                    updatedAt: Date;
                    currency: string;
                    code: string;
                    active: boolean;
                };
                variants: {
                    id: string;
                    createdAt: Date;
                    name: string;
                    updatedAt: Date;
                    currency: string;
                    description: string | null;
                    active: boolean;
                    slug: string;
                    sortOrder: number;
                    productRegionId: string;
                    customerPrice: import("@prisma/client/runtime/library").Decimal;
                }[];
            } & {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                productId: string;
                active: boolean;
                regionId: string;
            })[];
        } & {
            region: string;
            id: string;
            createdAt: Date;
            name: string;
            merchantId: string | null;
            status: string;
            updatedAt: Date;
            productType: string;
            categoryId: string | null;
            supplierId: string | null;
        })[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        description: string | null;
        image: string | null;
        active: boolean;
        slug: string;
        brandId: string | null;
        sortOrder: number;
    })[]>;
    getCatalogStats(): Promise<{
        categories: {
            total: number;
        };
        products: {
            total: number;
            active: number;
            inactive: number;
        };
        regions: {
            total: number;
        };
        variants: {
            total: number;
        };
        combinations: {
            total: number;
            active: number;
            inactive: number;
            fulfillable: number;
            unavailable: number;
        };
    }>;
}
