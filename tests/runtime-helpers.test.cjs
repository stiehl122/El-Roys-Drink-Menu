const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getState,
  loadSandboxWithScripts,
  resolveRuntimeScriptPath,
} = require('./helpers/runtime.cjs');

test('resolveRuntimeScriptPath resolves repo-relative script paths', () => {
  const resolved = resolveRuntimeScriptPath('app.js');
  assert.match(resolved, /El-Roys-Drink-Menu\/app\.js$/);
});

test('loadSandboxWithScripts evaluates runtime files in explicit order', () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/model.js',
    'core/landing/store.js',
    'core/landing/data-service.js',
    'core/landing/admin-workspace.js',
    'core/landing/root-renderer.js',
    'app.js',
    'routes/shared/public-route-core.js',
    'leroyslounge/app.js',
  ]);
  const restaurantId = getState(sandbox, 'window.__publicRouteRenderer?.restaurantId || ""');
  assert.equal(restaurantId, '00000000-0000-0000-0000-000000000010');
});

test('loadSandboxWithScripts preloads landing runtime before app.js when needed', () => {
  const sandbox = loadSandboxWithScripts(['app.js']);
  const record = getState(sandbox, 'createDefaultLandingPageRecord()');

  assert.equal(typeof sandbox.__HF_LANDING_MODULES__, 'object');
  assert.equal(typeof sandbox.__HF_LANDING_MODULES__.createLandingModel, 'function');
  assert.equal(record.id, 'root');
  assert.equal(Array.isArray(record.draftContent.news.items), true);
});
