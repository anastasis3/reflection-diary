#!/usr/bin/env node
/**
 * Checks that every route the server defines also appears in the OpenAPI
 * description, and that the description does not promise routes that do not
 * exist.
 *
 * Documentation drifts because nothing notices when it does. This script runs
 * in CI, so adding an endpoint without describing it fails the build on the
 * same pull request, while the reason is still obvious.
 *
 * It reads the route files as text rather than importing them: the point is to
 * compare what is *written* in src/routes against what is written in
 * docs/openapi.yaml, with nothing executed in between.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routesDir = path.join(root, 'src', 'routes');
const specFile = path.join(root, 'docs', 'openapi.yaml');

const METHODS = 'get|post|put|patch|delete';

/** '/prompts/:id/rating' -> '/prompts/{id}/rating' */
const toOpenApi = (p) => p.replace(/:([A-Za-z_][\w]*)/g, '{$1}');

/** Joins a mount prefix and a route path into one clean path. */
function join(prefix, routePath) {
  const joined = `${prefix}${routePath === '/' ? '' : routePath}`;
  return joined === '' ? '/' : joined;
}

// --- 1. what the code defines ----------------------------------------------
const indexSource = fs.readFileSync(path.join(routesDir, 'index.js'), 'utf8');
const defined = new Set();

// Routes declared directly on the API router, such as /health and /zones.
for (const match of indexSource.matchAll(
  new RegExp(`router\\.(${METHODS})\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g'),
)) {
  defined.add(`${match[1].toUpperCase()} ${toOpenApi(match[2])}`);
}

// Mounted routers: router.use('/prompts', promptsRoutes)
const mounts = [...indexSource.matchAll(/router\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)/g)].map(
  ([, prefix, variable]) => ({ prefix, variable }),
);

for (const { prefix, variable } of mounts) {
  // import promptsRoutes from './prompts.routes.js'
  const importLine = indexSource.match(
    new RegExp(`import\\s+${variable}\\s+from\\s+['"\`]\\./([^'"\`]+)['"\`]`),
  );
  if (!importLine) {
    console.error(`Could not find the import for ${variable} in routes/index.js`);
    process.exit(1);
  }

  const source = fs.readFileSync(path.join(routesDir, importLine[1]), 'utf8');
  for (const match of source.matchAll(
    new RegExp(`router\\.(${METHODS})\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g'),
  )) {
    defined.add(`${match[1].toUpperCase()} ${toOpenApi(join(prefix, match[2]))}`);
  }
}

// --- 2. what the description promises --------------------------------------
// A light parse: a path is a line indented by two spaces under `paths:` that
// starts with a slash, and its methods are the keys indented by four.
const spec = fs.readFileSync(specFile, 'utf8').split('\n');
const described = new Set();
let currentPath = null;
let inPaths = false;

for (const line of spec) {
  if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
  if (inPaths && /^\S/.test(line)) { inPaths = false; } //  left the paths block
  if (!inPaths) continue;

  const pathLine = line.match(/^ {2}(\/\S*):\s*$/);
  if (pathLine) { currentPath = pathLine[1]; continue; }

  const methodLine = line.match(new RegExp(`^ {4}(${METHODS}):\\s*$`));
  if (methodLine && currentPath) {
    described.add(`${methodLine[1].toUpperCase()} ${currentPath}`);
  }
}

// --- 3. compare -------------------------------------------------------------
const missing = [...defined].filter((route) => !described.has(route)).sort();
const extra = [...described].filter((route) => !defined.has(route)).sort();

console.log(`routes defined in src/routes : ${defined.size}`);
console.log(`routes described in openapi  : ${described.size}`);

if (missing.length > 0) {
  console.error('\nThese routes exist but are not documented in docs/openapi.yaml:');
  for (const route of missing) console.error(`  - ${route}`);
}
if (extra.length > 0) {
  console.error('\nThese routes are documented but do not exist in src/routes:');
  for (const route of extra) console.error(`  - ${route}`);
}

if (missing.length > 0 || extra.length > 0) {
  console.error('\nThe API and its description have drifted apart.');
  process.exit(1);
}

console.log('\nThe API and docs/openapi.yaml agree.');
