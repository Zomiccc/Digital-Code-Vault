import { ProductsService } from './products.service';
export declare class ProductsController {
    private productsService;
    constructor(productsService: ProductsService);
    listProducts(req: any): Promise<({
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
    getDenominations(id: string): Promise<{
        id: string;
        face_value: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        available_stock: number;
    }[]>;
}
