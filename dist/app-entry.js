"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
for (const candidate of ['.env', '.env.dev', '../../.env', '../../.env.dev']) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) {
        dotenv.config({ path: resolved });
    }
}
const production_config_validator_1 = require("./common/production-config.validator");
(0, production_config_validator_1.validateProductionEnv)(process.env);
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const app_module_1 = require("./app.module");
const security_headers_middleware_1 = require("./common/middleware/security-headers.middleware");
const request_logger_middleware_1 = require("./common/middleware/request-logger.middleware");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        bufferLogs: true,
        rawBody: true,
    });
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('PORT', 3000);
    const isDev = configService.get('NODE_ENV') === 'development';
    const corsOriginsRaw = (configService.get('CORS_ORIGIN', isDev ? '*' : '') || '').replace(/^["']|["']$/g, '');
    const appUrl = (configService.get('APP_URL', '') || '').replace(/\/+$/, '');
    const isWildcard = corsOriginsRaw.trim() === '*';
    const allowedOrigins = corsOriginsRaw.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
    if (appUrl && !allowedOrigins.includes(appUrl)) {
        allowedOrigins.push(appUrl);
    }
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            const normalizedOrigin = (origin || '').replace(/\/+$/, '');
            if (isWildcard || !origin || allowedOrigins.includes(normalizedOrigin)) {
                callback(null, true);
            }
            else {
                callback(new Error(`Origin ${origin} not allowed by CORS`));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }));
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: false,
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
    }));
    const securityHeaders = new security_headers_middleware_1.SecurityHeadersMiddleware(app.get(config_1.ConfigService));
    app.use(securityHeaders.use.bind(securityHeaders));
    app.use(new request_logger_middleware_1.RequestLoggerMiddleware().use.bind(new request_logger_middleware_1.RequestLoggerMiddleware()));
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
    }));
    app.setGlobalPrefix('api/v1');
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Digital Code Vault API')
        .setDescription('Secure platform for storing, managing, and fulfilling digital codes (gift cards, activation codes, PINs) with encrypted storage, wallet-based billing, and webhook-driven fulfillment.')
        .setVersion('1.0.0')
        .addTag('auth', 'Authentication endpoints')
        .addTag('fulfillment', 'Merchant fulfillment API (requires API key + HMAC signing)')
        .addTag('orders', 'Order status lookup')
        .addTag('sandbox', 'Sandbox/test fulfillment')
        .addTag('merchant', 'Merchant dashboard endpoints (JWT auth)')
        .addTag('wallet', 'Merchant wallet endpoints (JWT auth)')
        .addTag('products', 'Product catalog endpoints (JWT auth)')
        .addTag('webhooks', 'Webhook management (API key or JWT auth)')
        .addTag('admin', 'Admin dashboard endpoints (JWT auth + admin role)')
        .addTag('delivery', 'Customer delivery portal (token-based, no auth)')
        .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'ApiKeyAuth')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWTAuth')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: {
            persistAuthorization: true,
        },
    });
    app.enableShutdownHooks();
    const logger = new common_1.Logger('Bootstrap');
    const parentDir = path.resolve(__dirname, '..');
    const resolveFrontendDir = (name) => {
        const candidates = [
            path.resolve(parentDir, name, 'dist'),
            path.resolve(parentDir, 'apps', name, 'dist'),
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate))
                return candidate;
        }
        return null;
    };
    const frontends = [
        { mount: '/merchant', name: 'merchant' },
        { mount: '/d', name: 'portal' },
        { mount: '', name: 'admin' },
    ];
    for (const { mount, name } of frontends) {
        const dir = resolveFrontendDir(name);
        if (!dir) {
            logger.warn(`Frontend dist for "${name}" not found — skipping ${mount || '/'}`);
            continue;
        }
        app.useStaticAssets(dir, {
            prefix: mount || undefined,
            index: false,
        });
        const indexHtml = path.join(dir, 'index.html');
        const mountPath = mount || '';
        app.use((req, res, next) => {
            if (req.method !== 'GET' || !req.accepts('html')) {
                return next();
            }
            if (req.path.startsWith('/api/') || req.path.startsWith('/reveal/')) {
                return next();
            }
            if (mountPath && !req.path.startsWith(mountPath + '/') && req.path !== mountPath) {
                return next();
            }
            const lastSegment = req.path.split('/').pop() || '';
            if (lastSegment.includes('.')) {
                return next();
            }
            res.sendFile(indexHtml);
        });
        logger.log(`Serving frontend at ${mount || '/'}`);
    }
    await app.listen(port);
    logger.log(`Digital Code Vault API running on port ${port}`);
    const loggedBaseUrl = appUrl || `http://localhost:${port}`;
    logger.log(`API base: ${loggedBaseUrl}/api/v1`);
}
bootstrap().catch((err) => {
    console.error('=== FATAL: Application failed to start ===');
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map