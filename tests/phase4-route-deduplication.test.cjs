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
});

test('restaurant route app files are thin adapters over shared route core', () => {
  const leroys = read('leroyslounge/app.js');
  const elroys = read('elroyscantina/app.js');

  assert.match(leroys, /createPublicRouteCore/);
  assert.match(elroys, /createPublicRouteCore/);
  assert.doesNotMatch(leroys, /function\s+resolveRouteContract\s*\(/);
  assert.doesNotMatch(elroys, /function\s+resolveRouteContract\s*\(/);
});
