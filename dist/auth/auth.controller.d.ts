import { AuthService } from './auth.service';
import { AdminLoginDto, MerchantLoginDto, CustomerRegisterDto, CustomerLoginDto, RefreshTokenDto } from '../dto/auth.dto';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    adminLogin(body: AdminLoginDto, req: any): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
        };
    }>;
    adminRefresh(body: RefreshTokenDto): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
    }>;
    merchantLogin(body: MerchantLoginDto, req: any): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
            name: string;
            merchantId: string;
            merchantName: string;
        };
    }>;
    merchantRefresh(body: RefreshTokenDto): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
    }>;
    customerRegister(body: CustomerRegisterDto, req: any): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
        };
    }>;
    customerLogin(body: CustomerLoginDto, req: any): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
            merchantId: string | null;
        };
    }>;
    customerRefresh(body: RefreshTokenDto): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
    }>;
    requestCustomerCode(body: {
        email: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    customerLoginWithCode(body: {
        email: string;
        code: string;
    }, req: any): Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
            merchantId: string | null;
        };
    }>;
}
