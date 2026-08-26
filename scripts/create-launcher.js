const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const apiDistDir = path.resolve(rootDir, 'apps', 'api', 'dist');

// 1. Create dist/ directory
fs.mkdirSync(distDir, { recursive: true });

// 2. Copy all files from apps/api/dist/ to dist/, renaming main.js to app-entry.js
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destName = entry.name === 'main.js' ? 'app-entry.js' : entry.name;
    const destPath = path.join(dest, destName);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
copyDir(apiDistDir, distDir);
console.log('Copied apps/api/dist/* to dist/ (main.js → app-entry.js)');

// 3. Create launcher as dist/main.js
const launcher = [
  '// Hostinger launcher — sets NODE_PATH so the app can find all deps',
  "const path = require('path');",
  "const rootNodeModules = path.resolve(__dirname, '..', 'node_modules');",
  "process.env.NODE_PATH = rootNodeModules;",
  "require('module').Module._initPaths();",
  "require('./app-entry.js');",
  '',
].join('\n');

fs.writeFileSync(path.join(distDir, 'main.js'), launcher);
console.log('Created dist/main.js launcher');
