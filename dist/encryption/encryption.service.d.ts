import { ConfigService } from '@nestjs/config';
export declare class EncryptionService {
    private configService;
    private readonly logger;
    private readonly key;
    constructor(configService: ConfigService);
    encrypt(plaintext: string): string;
    decrypt(encryptedData: string): string;
    hashCode(plaintext: string): string;
    maskCode(plaintext: string): string;
    generateToken(bytes?: number): string;
    hashToken(token: string): string;
    hmacSha256(secret: string, data: string): string;
    safeCompare(a: string, b: string): boolean;
}
