process.env.DATABASE_URL = 'file:./dev.db';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
process.env.JWT_SECRET = 'jwtsecret123';
process.env.JWT_REFRESH_SECRET = 'refreshsecret123';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.NODE_ENV = 'development';
process.env.PORT = '3000';

require('./dist/src/main.js');
