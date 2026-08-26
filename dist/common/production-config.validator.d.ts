import { ConfigService } from '@nestjs/config';
export declare function validateProductionEnv(env?: NodeJS.ProcessEnv): void;
export declare class ProductionConfigValidator {
    private configService;
    constructor(configService: ConfigService);
    validate(): void;
}
