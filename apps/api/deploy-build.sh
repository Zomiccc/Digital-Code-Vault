#!/bin/bash
# deploy-build.sh — Hostinger Node.js App build script
# Run this as the "Build command" in Hostinger's Node.js App settings:
#   bash apps/api/deploy-build.sh
#
# This script ensures the Prisma client is generated correctly for the
# Hostinger (Linux) environment, even when env vars aren't exported
# during npm install.

set -e

echo "=== deploy-build.sh starting ==="

# Fix permissions on prisma binary (common Hostinger issue)
chmod +x node_modules/.bin/* 2>/dev/null || true
chmod +x apps/api/node_modules/.bin/* 2>/dev/null || true

# Navigate to the API directory
cd apps/api

# Fix permissions again after cd (in case node_modules is here)
chmod +x node_modules/.bin/* 2>/dev/null || true

# Step 1: Set the Prisma provider based on DATABASE_URL
# set-provider.js now auto-loads .env if present
echo "--- Setting Prisma provider ---"
node prisma/set-provider.js

# Step 2: Generate the Prisma client
# Use the local prisma binary directly instead of npx (more reliable)
echo "--- Generating Prisma client ---"
if [ -f node_modules/.bin/prisma ]; then
  node_modules/.bin/prisma generate --schema=prisma/schema.prisma
elif [ -f ../../node_modules/.bin/prisma ]; then
  ../../node_modules/.bin/prisma generate --schema=prisma/schema.prisma
else
  npx prisma generate --schema=prisma/schema.prisma
fi

# Step 3: Verify the client was generated
echo "--- Verifying Prisma client ---"
if [ -d node_modules/.prisma/client ]; then
  echo "OK: node_modules/.prisma/client exists"
  ls -la node_modules/.prisma/client/ | head -5
elif [ -d ../../node_modules/.prisma/client ]; then
  echo "OK: ../../node_modules/.prisma/client exists (hoisted)"
  ls -la ../../node_modules/.prisma/client/ | head -5
else
  echo "WARNING: .prisma/client not found in expected locations"
  echo "Searching for it..."
  find . -path "*/.prisma/client" -type d 2>/dev/null | head -5
  find ../.. -path "*/.prisma/client" -type d 2>/dev/null | head -5
fi

echo "=== deploy-build.sh complete ==="
