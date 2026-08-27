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

// 2c. Copy the built React frontends into dist/public/<name>.
// Hostinger only deploys the output directory, so apps/<name>/dist is not
// available at runtime. Nesting the frontend builds inside dist/ keeps the
// output directory self-contained and lets main.ts serve them.
for (const name of ['admin', 'merchant', 'portal']) {
  const src = path.resolve(rootDir, 'apps', name, 'dist');
  if (!fs.existsSync(src)) {
    console.warn(`WARNING: ${name} frontend build not found at apps/${name}/dist`);
    continue;
  }
  copyDir(src, path.join(distDir, 'public', name));
  console.log(`Copied apps/${name}/dist to dist/public/${name}/`);
}

// 2d. Copy the pre-built WordPress plugin ZIP into dist/public/merchant/.
// This guarantees the plugin is available even if Vite didn't copy it.
const pluginZip = path.resolve(rootDir, 'apps', 'merchant', 'public', 'dcv-webhook-plugin.zip');
if (fs.existsSync(pluginZip)) {
  const destZip = path.join(distDir, 'public', 'merchant', 'dcv-webhook-plugin.zip');
  fs.mkdirSync(path.dirname(destZip), { recursive: true });
  fs.copyFileSync(pluginZip, destZip);
  console.log('Copied dcv-webhook-plugin.zip to dist/public/merchant/');
} else {
  console.warn('WARNING: dcv-webhook-plugin.zip not found in apps/merchant/public/');
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
