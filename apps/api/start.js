// Load environment variables from root .env file
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Ensure DATABASE_URL is set for Prisma
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

require('./dist/src/main.js');
