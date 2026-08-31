#!/usr/bin/env node
/**
 * copy-deps.js — copies node_modules and .prisma client into dist/
 * so Hostinger's GitHub auto-deploy can resolve all runtime dependencies.
 *
 * Hostinger copies only the output directory (dist/) to the deployment path.
 * Without node_modules inside dist/, the app crashes with
 * "Cannot find module 'dotenv'" etc.
 */
const fs = require('fs');
const path = require('path');

function copyDir(src, dest, skip = []) {
  if (!fs.existsSync(src)) return false;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d, skip);
    } else {
      fs.copyFileSync(s, d);
    }
  }
  return true;
}

const distDir = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
  console.error('copy-deps: dist/ not found — run build:copy first');
  process.exit(1);
}

// 1. Copy root node_modules to dist/node_modules
//    Skip .cache, .bin, and other non-runtime dirs to save space/time
const skipDirs = ['.cache', '.bin', '.npm', '.package-lock.json'];
const nodeModulesSrc = path.resolve(process.cwd(), 'node_modules');
const nodeModulesDest = path.resolve(distDir, 'node_modules');

console.log('copy-deps: copying node_modules to dist/...');
if (fs.existsSync(nodeModulesSrc)) {
  // Copy .prisma first if it exists (critical for Prisma client)
  const prismaSrc = path.join(nodeModulesSrc, '.prisma');
  if (fs.existsSync(prismaSrc)) {
    const prismaDest = path.join(nodeModulesDest, '.prisma');
    console.log('copy-deps: copying .prisma client...');
    copyDir(prismaSrc, prismaDest);
  }

  // Copy @prisma/client
  const prismaClientSrc = path.join(nodeModulesSrc, '@prisma', 'client');
  if (fs.existsSync(prismaClientSrc)) {
    const prismaClientDest = path.join(nodeModulesDest, '@prisma', 'client');
    console.log('copy-deps: copying @prisma/client...');
    copyDir(prismaClientSrc, prismaClientDest);
  }

  // Copy all other node_modules (skip .prisma and @prisma already done)
  console.log('copy-deps: copying remaining node_modules...');
  for (const entry of fs.readdirSync(nodeModulesSrc, { withFileTypes: true })) {
    if (entry.name === '.prisma' || entry.name === '@prisma') continue;
    if (skipDirs.includes(entry.name)) continue;
    const s = path.join(nodeModulesSrc, entry.name);
    const d = path.join(nodeModulesDest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
  console.log('copy-deps: OK node_modules copied to dist/');
} else {
  // Try apps/api/node_modules as fallback
  const apiNodeModules = path.resolve(process.cwd(), 'apps/api/node_modules');
  if (fs.existsSync(apiNodeModules)) {
    console.log('copy-deps: using apps/api/node_modules as source...');
    copyDir(apiNodeModules, nodeModulesDest);
    console.log('copy-deps: OK node_modules copied to dist/');
  } else {
    console.error('copy-deps: WARNING — no node_modules found!');
  }
}

// 2. Copy prisma schema to dist/ (needed by Prisma client at runtime)
const prismaSchemaSrc = path.resolve(process.cwd(), 'apps/api/prisma/schema.prisma');
const prismaSchemaDest = path.resolve(distDir, 'prisma', 'schema.prisma');
if (fs.existsSync(prismaSchemaSrc)) {
  fs.mkdirSync(path.dirname(prismaSchemaDest), { recursive: true });
  fs.copyFileSync(prismaSchemaSrc, prismaSchemaDest);
  console.log('copy-deps: OK prisma/schema.prisma copied to dist/');
}

console.log('copy-deps: complete');
