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

echo "=== deploy-build.sh complete ==="
