/**
 * Auto-detects the Prisma provider from DATABASE_URL and updates schema.prisma.
 * - postgresql:// → provider = "postgresql"
 * - file:         → provider = "sqlite"
 *
 * Run before: prisma generate, prisma migrate, prisma studio
 * Usage: node prisma/set-provider.js
 */
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');

const dbUrl = process.env.DATABASE_URL || '';
let provider = 'sqlite';

if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
  provider = 'postgresql';
} else if (dbUrl.startsWith('file:')) {
  provider = 'sqlite';
}

const updated = schema.replace(
  /provider\s*=\s*"(sqlite|postgresql)"/,
  `provider = "${provider}"`
);

if (schema === updated) {
  // No change needed or pattern not found — try to find the datasource block
  if (!/provider\s*=\s*"/.test(schema)) {
    console.error('Could not find provider in schema.prisma');
    process.exit(1);
  }
  console.log(`Prisma provider already set to: ${provider}`);
} else {
  fs.writeFileSync(schemaPath, updated);
  console.log(`Prisma provider set to: ${provider} (detected from DATABASE_URL)`);
}
