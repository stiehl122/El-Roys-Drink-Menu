const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  getState,
  loadSandboxWithScripts,
  resolveRuntimeScriptPath,
} = require('./helpers/runtime.cjs');

test('resolveRuntimeScriptPath resolves repo-relative script paths', () => {
  const resolved = resolveRuntimeScriptPath('app.js');
  assert.equal(path.basename(resolved), 'app.js');
  assert.ok(path.isAbsolute(resolved));
  assert.ok(fs.existsSync(resolved));
});

test('loadSandboxWithScripts evaluates runtime files in explicit order', () => {
  const sandbox = loadSandboxWithScripts([
    'app.js',
    'routes/shared/public-route-core.js',
    'leroyslounge/app.js',
  ]);
  const restaurantId = getState(sandbox, 'window.__publicRouteRenderer?.restaurantId || ""');
  assert.equal(restaurantId, '00000000-0000-0000-0000-000000000010');
});
