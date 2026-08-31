#!/bin/bash
set -e

echo "=== Hostinger build starting ==="

# Step 1: Build shared package
echo "--- Building shared package ---"
cd packages/shared && npm run build && cd ../..

# Step 2: Generate Prisma client
echo "--- Generating Prisma client ---"
cd apps/api && node prisma/set-provider.js && npx prisma generate --schema=prisma/schema.prisma && cd ../..

# Step 3: Build API
echo "--- Building API ---"
cd apps/api && npx tsc -p tsconfig.build.json && cd ../..

# Step 4: Build frontends
echo "--- Building admin ---"
cd apps/admin && npx vite build && cd ../..
echo "--- Building merchant ---"
cd apps/merchant && npx vite build && cd ../..
echo "--- Building portal ---"
cd apps/portal && npx vite build && cd ../..

# Step 5: Copy API dist to root dist/
echo "--- Copying apps/api/dist to dist/ ---"
node -e "const fs=require('fs'),p=require('path');function cp(s,d){if(!fs.existsSync(s))return;if(fs.statSync(s).isDirectory()){fs.mkdirSync(d,{recursive:true});for(const e of fs.readdirSync(s))cp(p.join(s,e),p.join(d,e))}else{fs.mkdirSync(p.dirname(d),{recursive:true});fs.copyFileSync(s,d)}}cp('apps/api/dist','dist')"

# Step 6: Copy dist-package.json as dist/package.json
echo "--- Copying package.json to dist/ ---"
cp dist-package.json dist/package.json

# Step 7: Install production deps inside dist/
echo "--- Installing production deps in dist/ ---"
cd dist && npm install --production --ignore-scripts && cd ..

# Step 8: Copy Prisma client into dist/node_modules/
echo "--- Copying Prisma client to dist/ ---"
node -e "const fs=require('fs'),p=require('path');function cp(s,d){if(!fs.existsSync(s))return;if(fs.statSync(s).isDirectory()){fs.mkdirSync(d,{recursive:true});for(const e of fs.readdirSync(s))cp(p.join(s,e),p.join(d,e))}else{fs.mkdirSync(p.dirname(d),{recursive:true});fs.copyFileSync(s,d)}}cp('node_modules/.prisma','dist/node_modules/.prisma');cp('apps/api/node_modules/.prisma','dist/node_modules/.prisma');console.log('Prisma client copied')"

# Step 9: Verify
echo "--- Verifying dist/ contents ---"
ls dist/
echo "--- Checking for dotenv ---"
ls dist/node_modules/dotenv/ && echo "OK: dotenv found" || echo "ERROR: dotenv NOT found"

echo "=== Hostinger build complete ==="
