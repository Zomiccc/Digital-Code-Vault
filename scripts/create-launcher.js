const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const apiDistDir = path.resolve(rootDir, 'apps', 'api', 'dist');

// 1. Create dist/ directory
fs.mkdirSync(distDir, { recursive: true });

// 2. Copy all files from apps/api/dist/ to dist/, renaming main.js to app-entry.js
function copyDir(src, dest, renameEntry) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destName = renameEntry ? renameEntry(entry.name) : entry.name;
    const destPath = path.join(dest, destName);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
// Only the top-level main.js is renamed; nested files keep their names.
copyDir(apiDistDir, distDir, (name) => (name === 'main.js' ? 'app-entry.js' : name));
console.log('Copied apps/api/dist/* to dist/ (main.js → app-entry.js)');

// 2b. Copy apps/api/node_modules into dist/node_modules.
// npm does not hoist every workspace dependency to the root node_modules
// (e.g. `archiver` stays nested because of a transitive glob version
// conflict). Hostinger only deploys the output directory plus the root
// node_modules, so any nested dependency would be missing at runtime.
// Copying them inside dist/ makes the output directory self-contained.
const apiNodeModules = path.resolve(rootDir, 'apps', 'api', 'node_modules');
if (fs.existsSync(apiNodeModules)) {
  const destNodeModules = path.join(distDir, 'node_modules');
  for (const entry of fs.readdirSync(apiNodeModules, { withFileTypes: true })) {
    if (entry.name === '.bin' || entry.name.startsWith('.')) continue;
    copyDir(path.join(apiNodeModules, entry.name), path.join(destNodeModules, entry.name));
  }
  console.log('Copied apps/api/node_modules/* to dist/node_modules/');
}

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
