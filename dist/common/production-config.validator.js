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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductionConfigValidator = void 0;
exports.validateProductionEnv = validateProductionEnv;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
function validateProductionEnv(env = process.env) {
    const logger = new common_1.Logger('ProductionConfigValidator');
    const nodeEnv = env.NODE_ENV || 'development';
    if (nodeEnv !== 'production') {
        return;
    }
    const errors = [];
    const jwtSecret = env.JWT_SECRET;
    if (!jwtSecret || jwtSecret === 'change-me-in-production' || jwtSecret === 'dev-only-insecure-secret') {
        errors.push('JWT_SECRET is missing or uses insecure default. Set a strong random string.');
    }
    const jwtRefreshSecret = env.JWT_REFRESH_SECRET;
    if (!jwtRefreshSecret || jwtRefreshSecret === 'change-me-in-production' || jwtRefreshSecret === 'dev-only-insecure-secret') {
        errors.push('JWT_REFRESH_SECRET is missing or uses insecure default. Set a strong random string.');
    }
    const corsOrigin = env.CORS_ORIGIN;
    if (!corsOrigin || corsOrigin.trim() === '*' || corsOrigin.includes('localhost')) {
        errors.push('CORS_ORIGIN must be set to production domain(s) in production. Wildcard and localhost are not allowed.');
    }
    const appUrl = env.APP_URL;
    if (!appUrl || appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
        errors.push('APP_URL must be set to the production API URL (e.g. https://api.yourdomain.com).');
    }
    const redisUrl = env.REDIS_URL;
    if (!redisUrl) {
        errors.push('REDIS_URL is required in production. In-memory fallback is not safe for production.');
    }
    const encryptionKey = env.ENCRYPTION_KEY;
    if (!encryptionKey) {
        errors.push('ENCRYPTION_KEY is required. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }
    const dbUrl = env.DATABASE_URL || '';
    if (!dbUrl) {
        errors.push('DATABASE_URL is required.');
    }
    else if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
        errors.push('DATABASE_URL must be a PostgreSQL connection string in production.');
    }
    const emailProvider = env.EMAIL_PROVIDER;
    if (emailProvider === 'sendgrid') {
        if (!env.SENDGRID_API_KEY) {
            errors.push('SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid.');
        }
    }
    else if (emailProvider === 'resend') {
        if (!env.RESEND_API_KEY) {
            errors.push('RESEND_API_KEY is required when EMAIL_PROVIDER=resend.');
        }
    }
    else if (emailProvider === 'smtp') {
        if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
            errors.push('SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are all required when EMAIL_PROVIDER=smtp.');
        }
    }
    else {
        errors.push('EMAIL_PROVIDER must be set to "sendgrid", "resend", or "smtp".');
    }
    if (errors.length > 0) {
        const message = '=== PRODUCTION CONFIG VALIDATION FAILED ===\n' +
            errors.map(e => `  ✗ ${e}`).join('\n') +
            '\n=============================================';
        logger.error(message);
        throw new Error(message);
    }
    logger.log('Production config validation passed — all required variables are set.');
}
let ProductionConfigValidator = class ProductionConfigValidator {
    configService;
    constructor(configService) {
        this.configService = configService;
    }
    validate() {
        validateProductionEnv(process.env);
    }
};
exports.ProductionConfigValidator = ProductionConfigValidator;
exports.ProductionConfigValidator = ProductionConfigValidator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ProductionConfigValidator);
//# sourceMappingURL=production-config.validator.js.map