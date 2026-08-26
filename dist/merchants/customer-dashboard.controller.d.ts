import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from '../products/products.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class CustomerDashboardController {
    private prisma;
    private authService;
    private auditService;
    private productsService;
    private fulfillmentService;
    constructor(prisma: PrismaService, authService: AuthService, auditService: AuditService, productsService: ProductsService, fulfillmentService: FulfillmentService);
    listProducts(): Promise<{
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
    getDenominations(id: string): Promise<{
        id: string;
        face_value: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        available_stock: number;
    }[]>;
    createOrder(body: any, req: any): Promise<any>;
    listOrders(req: any): Promise<{
        id: any;
        product_name: any;
        amount: any;
        status: any;
        failureReason: any;
        createdAt: any;
        customer_address: any;
        delivery_link: string | null;
        revealed: boolean;
    }[]>;
    becomeMerchant(body: any, req: any): Promise<{
        success: boolean;
        message: string;
        applicationId: string;
        status: string;
    }>;
    getProfile(req: any): Promise<{
        id: string;
        email: string;
        name: string;
        merchantId: string | null;
        isMerchant: boolean;
        merchantAppStatus: string | null;
    }>;
}
