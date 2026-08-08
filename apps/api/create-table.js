const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS Customer (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      passwordHash TEXT,
      isActive BOOLEAN DEFAULT 1,
      merchantId TEXT,
      lastLoginAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('Customer table created');
    
    await p.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS Customer_merchantId_idx ON Customer(merchantId)');
    console.log('Index created');
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
