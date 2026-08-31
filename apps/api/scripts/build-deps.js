#!/usr/bin/env node
/**
 * build-deps.js — runs after tsc to make dist/ self-contained.
 *
 * Hostinger's GitHub auto-deploy:
 *   1. Runs `npm install` (root or workspace)
 *   2. Runs `npm run build` in apps/api → tsc + this script
 *   3. Copies the output directory (dist/) to the deployment path
 *
 * Without node_modules inside dist/, the app crashes with
 * "Cannot find module 'dotenv'" because Hostinger doesn't copy
 * the root node_modules to the runtime path.
 *
 * This script:
 *   1. Copies a minimal package.json into dist/
 *   2. Runs `npm install --production --ignore-scripts` inside dist/
 *   3. Copies the .prisma client into dist/node_modules/
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const rootDir = path.resolve(__dirname, '..', '..', '..');

console.log('build-deps: making dist/ self-contained...');

// 1. Copy dist-package.json as dist/package.json
const distPkgSrc = path.resolve(rootDir, 'dist-package.json');
const distPkgDest = path.resolve(distDir, 'package.json');
if (fs.existsSync(distPkgSrc)) {
  fs.copyFileSync(distPkgSrc, distPkgDest);
  console.log('build-deps: copied dist-package.json → dist/package.json');
} else {
  // Fallback: copy apps/api/package.json but strip devDependencies
  const apiPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
  delete apiPkg.devDependencies;
  delete apiPkg.scripts;
  apiPkg.scripts = { start: 'node main.js' };
  fs.writeFileSync(distPkgDest, JSON.stringify(apiPkg, null, 2));
  console.log('build-deps: generated dist/package.json from apps/api/package.json');
}

// 2. Run npm install --production inside dist/
console.log('build-deps: running npm install --production in dist/...');
try {
  execSync('npm install --production --ignore-scripts', {
    cwd: distDir,
    stdio: 'inherit',
    timeout: 120000,
  });
  console.log('build-deps: npm install completed');
} catch (err) {
  console.error('build-deps: npm install FAILED:', err.message);
  process.exit(1);
}

// 3. Copy .prisma client into dist/node_modules/
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
  return true;
}

const prismaSources = [
  path.resolve(__dirname, '..', 'node_modules', '.prisma'),
  path.resolve(rootDir, 'node_modules', '.prisma'),
];
const prismaDest = path.resolve(distDir, 'node_modules', '.prisma');
for (const src of prismaSources) {
  if (fs.existsSync(src)) {
    copyDir(src, prismaDest);
    console.log('build-deps: copied .prisma client to dist/node_modules/.prisma');
    break;
  }
}

// Also copy @prisma/client if not already installed by npm
const prismaClientSrc = path.resolve(__dirname, '..', 'node_modules', '@prisma', 'client');
const prismaClientDest = path.resolve(distDir, 'node_modules', '@prisma', 'client');
const prismaClientRoot = path.resolve(rootDir, 'node_modules', '@prisma', 'client');
if (!fs.existsSync(prismaClientDest)) {
  if (fs.existsSync(prismaClientSrc)) {
    copyDir(prismaClientSrc, prismaClientDest);
    console.log('build-deps: copied @prisma/client from apps/api');
  } else if (fs.existsSync(prismaClientRoot)) {
    copyDir(prismaClientRoot, prismaClientDest);
    console.log('build-deps: copied @prisma/client from root');
  }
}

// 4. Verify dotenv exists
const dotenvPath = path.resolve(distDir, 'node_modules', 'dotenv');
if (fs.existsSync(dotenvPath)) {
  console.log('build-deps: OK — dotenv found in dist/node_modules/');
} else {
  console.error('build-deps: ERROR — dotenv NOT found in dist/node_modules/!');
  process.exit(1);
}

console.log('build-deps: complete ✓');
