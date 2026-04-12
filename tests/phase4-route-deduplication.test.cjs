const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('phase 4 shared route core exists and exports a route factory', () => {
  const source = read('routes/shared/public-route-core.js');
  assert.match(source, /createPublicRouteCore/);
  assert.match(source, /__HF_ROUTE_MODULES__/);
  assert.doesNotMatch(source, /function\s+createLegacyRouteActions\s*\(/);
  assert.doesNotMatch(source, /function\s+resolveRouteContract\s*\(/);
  assert.doesNotMatch(source, /windowRef\.initializeRoute\s*=/);
  assert.doesNotMatch(source, /windowRef\.renderRouteBootShell\s*=/);
});

test('restaurant route app files are thin adapters over shared route core', () => {
  const leroys = read('leroyslounge/app.js');
  const elroys = read('elroyscantina/app.js');

  assert.match(leroys, /createPublicRouteCore/);
  assert.match(elroys, /createPublicRouteCore/);
  assert.doesNotMatch(leroys, /function\s+resolveRouteContract\s*\(/);
  assert.doesNotMatch(elroys, /function\s+resolveRouteContract\s*\(/);
});

test('shared app route handoff no longer relies on legacy route globals', () => {
  const app = read('app.js');
  assert.doesNotMatch(app, /window\.initializeRoute/);
  assert.doesNotMatch(app, /window\.renderRouteBootShell/);
});
