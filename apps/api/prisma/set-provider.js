/**
 * Auto-detects the Prisma provider from DATABASE_URL and updates schema.prisma.
 * - postgresql:// → provider = "postgresql"
 * - file:         → provider = "sqlite"
 *
 * Also updates migration_lock.toml to match.
 *
 * Loads .env automatically if present, so this works even when env vars
 * aren't exported by the shell (e.g. Hostinger's npm install step).
 *
 * Run before: prisma generate, prisma migrate, prisma studio
 * Usage: node prisma/set-provider.js
 */
const fs = require('fs');
const path = require('path');

// Load .env if present (won't override already-set env vars)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

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
  if (!/provider\s*=\s*"/.test(schema)) {
    console.error('Could not find provider in schema.prisma');
    process.exit(1);
  }
  console.log(`Prisma provider already set to: ${provider}`);
} else {
  fs.writeFileSync(schemaPath, updated);
  console.log(`Prisma provider set to: ${provider} (detected from DATABASE_URL)`);
}

// Also update migration_lock.toml
const lockPath = path.join(__dirname, 'migrations', 'migration_lock.toml');
if (fs.existsSync(lockPath)) {
  const lock = fs.readFileSync(lockPath, 'utf8');
  const lockUpdated = lock.replace(
    /provider\s*=\s*"(sqlite|postgresql)"/,
    `provider = "${provider}"`
  );
  if (lock !== lockUpdated) {
    fs.writeFileSync(lockPath, lockUpdated);
    console.log(`Migration lock provider set to: ${provider}`);
  }
}
