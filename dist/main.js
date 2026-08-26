// Hostinger launcher — sets NODE_PATH so the app can find all deps
const path = require('path');
const rootNodeModules = path.resolve(__dirname, '..', 'node_modules');
process.env.NODE_PATH = rootNodeModules;
require('module').Module._initPaths();
require('./app-entry.js');
