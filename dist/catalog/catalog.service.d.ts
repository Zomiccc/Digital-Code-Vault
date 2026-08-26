import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
export declare class CatalogService {
    private prisma;
    private auditService;
    private readonly logger;
    constructor(prisma: PrismaService, auditService: AuditService);
    listBrands(activeOnly?: boolean): Promise<({
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
    createBrand(data: {
        name: string;
        slug?: string;
        description?: string;
        image?: string;
        sortOrder?: number;
    }, actorId?: string): Promise<{
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
    updateBrand(id: string, data: any, actorId?: string): Promise<{
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
    deleteBrand(id: string, actorId?: string): Promise<{
        id: string;
        deactivated: boolean;
    }>;
    listCategories(activeOnly?: boolean): Promise<({
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
    createCategory(data: {
        name: string;
        slug?: string;
        description?: string;
        image?: string;
        sortOrder?: number;
        brandId?: string | null;
    }, actorId?: string): Promise<{
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
    updateCategory(id: string, data: any, actorId?: string): Promise<{
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
    deleteCategory(id: string, actorId?: string): Promise<{
        id: string;
        deactivated: boolean;
    }>;
    listRegions(activeOnly?: boolean): Promise<{
        symbol: string;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        currency: string;
        code: string;
        active: boolean;
    }[]>;
    createRegion(data: {
        name: string;
        code: string;
        currency?: string;
        symbol?: string;
    }, actorId?: string): Promise<{
        symbol: string;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        currency: string;
        code: string;
        active: boolean;
    }>;
    updateRegion(id: string, data: any, actorId?: string): Promise<{
        symbol: string;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        currency: string;
        code: string;
        active: boolean;
    }>;
    deleteRegion(id: string, actorId?: string): Promise<{
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
    createProductRegion(data: {
        productId: string;
        regionId: string;
    }, actorId?: string): Promise<{
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
    deleteProductRegion(id: string, actorId?: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
    listVariants(productRegionId?: string): Promise<({
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
    createVariantForProduct(productId: string, data: {
        name: string;
        customerPrice: number;
        description?: string;
        currency?: string;
    }, actorId?: string): Promise<{
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
    createVariant(data: {
        productRegionId: string;
        name: string;
        slug?: string;
        description?: string;
        customerPrice: number;
        currency?: string;
        sortOrder?: number;
    }, actorId?: string): Promise<{
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
    updateVariant(id: string, data: any, actorId?: string): Promise<{
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
    deleteVariant(id: string, actorId?: string): Promise<{
        id: string;
        deactivated: boolean;
    }>;
    listCombinations(variantId?: string, activeOnly?: boolean): Promise<{
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
    createCombination(data: {
        variantId: string;
        name: string;
        priority?: number;
        active?: boolean;
        items: {
            denominationId: string;
            quantity: number;
        }[];
    }, actorId?: string): Promise<{
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
    updateCombination(id: string, data: {
        name?: string;
        priority?: number;
        active?: boolean;
        items?: {
            denominationId: string;
            quantity: number;
        }[];
    }, actorId?: string): Promise<{
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
    deleteCombination(id: string, actorId?: string): Promise<{
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
    isCombinationFulfillable(combo: any): Promise<boolean>;
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
