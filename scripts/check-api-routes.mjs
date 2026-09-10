#!/usr/bin/env node
/**
 * Every path the admin app calls must exist on the API.
 *
 * The Prices screen asked for `GET /admin/prices/:itemType/:itemId` on every
 * render and got a 404, because only PUT and DELETE were ever written. No
 * price ever displayed and saving one looked like it did nothing — the save
 * worked, and the re-read that would have shown it did not exist. Nothing
 * failed loudly, so it survived until someone reported "the button does
 * nothing".
 *
 * A missing route is invisible to the type checker: the client builds paths as
 * strings and the server declares them in decorators, and the two never meet.
 * This walks both sides and compares them.
 *
 * Run: node scripts/check-api-routes.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_SRC = 'apps/api/src';
const CLIENTS = ['apps/admin/src/lib/api.ts'];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Every `VERB /path` the API declares, with `:param` where it takes one. */
function declaredRoutes() {
  const routes = [];
  for (const file of walk(API_SRC).filter((f) => f.endsWith('.controller.ts'))) {
    const text = readFileSync(file, 'utf8');
    const prefix = (text.match(/@Controller\(\s*['"]([^'"]*)['"]/)?.[1] ?? '').replace(/^\/|\/$/g, '');
    const decorator = /@(Get|Post|Put|Patch|Delete)\(\s*(?:['"]([^'"]*)['"])?\s*\)/g;
    for (const [, verb, path] of text.matchAll(decorator)) {
      const tail = (path ?? '').replace(/^\/|\/$/g, '');
      routes.push({
        verb: verb.toUpperCase(),
        parts: [prefix, tail].filter(Boolean).join('/').split('/').filter(Boolean),
      });
    }
  }
  return routes;
}

/** A called path, reduced to the shape a decorator would declare. */
function shapeOf(path) {
  return path
    .split('?')[0]
    .replace(/\$\{[^}]*\}/g, ':param')
    .split('/')
    .filter(Boolean);
}

function isDeclared(routes, verb, parts) {
  return routes.some(
    (route) =>
      route.verb === verb &&
      route.parts.length === parts.length &&
      route.parts.every(
        (part, i) => part.startsWith(':') || parts[i] === ':param' || part === parts[i],
      ),
  );
}

const routes = declaredRoutes();
const problems = [];

for (const client of CLIENTS) {
  const text = readFileSync(client, 'utf8');
  const call = /apiFetch\(\s*[`'"]([^`'"]+)[`'"]\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/g;
  for (const [, path, options = ''] of text.matchAll(call)) {
    const verb = (options.match(/method:\s*'(\w+)'/)?.[1] ?? 'GET').toUpperCase();
    // A trailing `${qs}` is a query string, not another path segment.
    const parts = shapeOf(path.replace(/\$\{qs\}$/, ''));
    if (!isDeclared(routes, verb, parts)) {
      problems.push(`${verb} /${parts.join('/')}   (${client})`);
    }
  }
}

console.log(`${routes.length} routes declared by the API`);

if (problems.length === 0) {
  console.log('Every call from the admin app reaches a real route.');
  process.exit(0);
}

console.error(`\n${problems.length} call(s) with no matching route:`);
for (const problem of [...new Set(problems)].sort()) console.error(`  ${problem}`);
console.error('\nEach of these returns 404 at runtime, silently.');
process.exit(1);
