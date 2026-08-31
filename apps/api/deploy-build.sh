#!/bin/bash
# deploy-build.sh — Hostinger Node.js App build script
# Run this as the "Build command" in Hostinger's Node.js App settings:
#   bash apps/api/deploy-build.sh
#
# This script builds the entire monorepo (shared, api, admin, merchant, portal)
# and ensures the Prisma client is generated correctly for the Hostinger
# (Linux) environment, even when env vars aren't exported during npm install.

set -e

echo "=== deploy-build.sh starting ==="

# Fix permissions on prisma binary (common Hostinger issue)
chmod +x node_modules/.bin/* 2>/dev/null || true
chmod +x apps/api/node_modules/.bin/* 2>/dev/null || true

# Step 1: Build shared package
echo "--- Building shared package ---"
cd packages/shared
npm run build
cd ../..

# Step 2: Build the API
echo "--- Building API ---"
cd apps/api
chmod +x node_modules/.bin/* 2>/dev/null || true
npx tsc -p tsconfig.build.json
cd ../..

# Step 3: Set the Prisma provider and generate client
echo "--- Setting Prisma provider ---"
cd apps/api
node prisma/set-provider.js

echo "--- Generating Prisma client ---"
if [ -f node_modules/.bin/prisma ]; then
  node_modules/.bin/prisma generate --schema=prisma/schema.prisma
elif [ -f ../../node_modules/.bin/prisma ]; then
  ../../node_modules/.bin/prisma generate --schema=prisma/schema.prisma
else
  npx prisma generate --schema=prisma/schema.prisma
fi

# Step 4: Verify the client was generated
echo "--- Verifying Prisma client ---"
if [ -d node_modules/.prisma/client ]; then
  echo "OK: node_modules/.prisma/client exists"
elif [ -d ../../node_modules/.prisma/client ]; then
  echo "OK: ../../node_modules/.prisma/client exists (hoisted)"
else
  echo "WARNING: .prisma/client not found in expected locations"
  find . -path "*/.prisma/client" -type d 2>/dev/null | head -5
  find ../.. -path "*/.prisma/client" -type d 2>/dev/null | head -5
fi
cd ../..

# Step 5: Build frontends
echo "--- Building admin frontend ---"
cd apps/admin
npx vite build
cd ../..

echo "--- Building merchant frontend ---"
cd apps/merchant
npx vite build
cd ../..

echo "--- Building portal frontend ---"
cd apps/portal
npx vite build
cd ../..

# Step 6: Verify output directories exist
echo "--- Verifying build output ---"
for dir in apps/api/dist apps/admin/dist apps/merchant/dist apps/portal/dist; do
  if [ -d "$dir" ]; then
    echo "OK: $dir exists"
    ls "$dir" | head -3
  else
    echo "ERROR: $dir does NOT exist!"
    exit 1
  fi
done

# Step 6b: Copy node_modules to dist/ so the deployed app can resolve dependencies.
# Hostinger's GitHub auto-deploy only copies the output directory (dist/), not the
# root node_modules/. Without this, the app crashes with "Cannot find module 'dotenv'".
echo "--- Copying node_modules to dist/ ---"
cd apps/api
if [ -d node_modules ]; then
  cp -r node_modules dist/node_modules
  echo "OK: copied apps/api/node_modules to dist/"
elif [ -d ../../node_modules ]; then
  cp -r ../../node_modules dist/node_modules
  echo "OK: copied root node_modules to dist/"
else
  echo "WARNING: no node_modules found to copy"
fi
cd ../..

# Step 6c: Copy Prisma client to dist/
echo "--- Copying Prisma client to dist/ ---"
if [ -d apps/api/node_modules/.prisma ]; then
  mkdir -p apps/api/dist/node_modules/.prisma
  cp -r apps/api/node_modules/.prisma apps/api/dist/node_modules/.prisma
  echo "OK: copied .prisma client to dist/"
elif [ -d node_modules/.prisma ]; then
  mkdir -p apps/api/dist/node_modules/.prisma
  cp -r node_modules/.prisma apps/api/dist/node_modules/.prisma
  echo "OK: copied root .prisma client to dist/"
fi

# Step 7: Copy WordPress plugin ZIP into apps/api/dist/
echo "--- Copying WordPress plugin ZIP ---"
if [ -f "apps/merchant/public/dcv-webhook-plugin.zip" ]; then
  cp apps/merchant/public/dcv-webhook-plugin.zip apps/api/dist/dcv-webhook-plugin.zip
  echo "OK: Plugin ZIP copied to apps/api/dist/"
else
  echo "WARNING: apps/merchant/public/dcv-webhook-plugin.zip not found"
fi

echo "=== deploy-build.sh complete ==="
