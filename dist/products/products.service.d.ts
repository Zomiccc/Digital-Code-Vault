import { PrismaService } from '../prisma/prisma.service';
export declare class ProductsService {
    private prisma;
    constructor(prisma: PrismaService);
    listProductsForMerchant(merchantId: string): Promise<({
        supplier: {
            id: string;
            createdAt: Date;
            name: string;
            status: string;
            updatedAt: Date;
            contactInfo: string | null;
        } | null;
        denominations: {
            id: string;
            createdAt: Date;
            currency: string;
            productId: string;
            faceValue: import("@prisma/client/runtime/library").Decimal;
        }[];
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
    })[]>;
    listAllProducts(): Promise<{
        denominations: any[];
        supplier: {
            id: string;
            createdAt: Date;
            name: string;
            status: string;
            updatedAt: Date;
            contactInfo: string | null;
        } | null;
        category: {
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
        } | null;
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
    }[]>;
    getProduct(productId: string): Promise<{
        supplier: {
            id: string;
            createdAt: Date;
            name: string;
            status: string;
            updatedAt: Date;
            contactInfo: string | null;
        } | null;
        denominations: {
            id: string;
            createdAt: Date;
            currency: string;
            productId: string;
            faceValue: import("@prisma/client/runtime/library").Decimal;
        }[];
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
    }>;
    getDenominations(productId: string): Promise<{
        id: string;
        face_value: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        available_stock: number;
    }[]>;
    createProduct(data: {
        name: string;
        region: string;
        supplierId?: string;
        productType?: string;
        categoryId?: string;
    }): Promise<{
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
    }>;
    updateProductCategory(productId: string, categoryId: string | null): Promise<{
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
    }>;
    updateProductType(productId: string, productType: string): Promise<{
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
    }>;
    createDenomination(productId: string, faceValue: number, currency?: string): Promise<{
        id: string;
        createdAt: Date;
        currency: string;
        productId: string;
        faceValue: import("@prisma/client/runtime/library").Decimal;
    }>;
}
