const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
fs.mkdirSync(distDir, { recursive: true });

const launcher = [
  '// Hostinger launcher — sets NODE_PATH so the real entry can find all deps',
  "const path = require('path');",
  "const apiNodeModules = path.resolve(__dirname, '..', 'apps', 'api', 'node_modules');",
  "const rootNodeModules = path.resolve(__dirname, '..', 'node_modules');",
  "process.env.NODE_PATH = apiNodeModules + path.delimiter + rootNodeModules;",
  "require('module').Module._initPaths();",
  "require(path.resolve(__dirname, '..', 'apps', 'api', 'dist', 'main.js'));",
  '',
].join('\n');

fs.writeFileSync(path.join(distDir, 'main.js'), launcher);
console.log('Created dist/main.js launcher');
