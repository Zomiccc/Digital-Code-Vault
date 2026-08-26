// Hostinger launcher — sets NODE_PATH so the real entry can find all deps
const path = require('path');
const apiNodeModules = path.resolve(__dirname, '..', 'apps', 'api', 'node_modules');
const rootNodeModules = path.resolve(__dirname, '..', 'node_modules');
process.env.NODE_PATH = apiNodeModules + path.delimiter + rootNodeModules;
require('module').Module._initPaths();
require(path.resolve(__dirname, '..', 'apps', 'api', 'dist', 'main.js'));
