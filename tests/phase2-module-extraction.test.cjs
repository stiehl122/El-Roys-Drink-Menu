const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('phase 2 modules contain extracted lifecycle/publish/loader/poller implementations', () => {
  const publishModule = read('core/session/publish-service.js');
  const lifecycleModule = read('core/session/menu-session.js');
  const loaderModule = read('core/data/menu-state-loader.js');
  const pollerModule = read('core/session/poll-scheduler.js');

  assert.match(publishModule, /async\s+function\s+publishUpdate\s*\(/);
  assert.match(publishModule, /async\s+function\s+saveDraft\s*\(/);
  assert.match(lifecycleModule, /async\s+open\s*\(/);
  assert.match(lifecycleModule, /async\s+refresh\s*\(/);
  assert.match(loaderModule, /async\s+load\s*\(/);
  assert.match(loaderModule, /async\s+poll\s*\(/);
  assert.match(pollerModule, /function\s+createMenuPollScheduler\s*\(/);
  assert.match(pollerModule, /function\s+run\s*\(/);
});

test('phase 2 boundary suites exist as dedicated files', () => {
  const expectedFiles = [
    'tests/boundaries/session.boundary.test.cjs',
    'tests/boundaries/publish.boundary.test.cjs',
  ];

  expectedFiles.forEach(file => {
    assert.equal(fs.existsSync(path.join(ROOT, file)), true, `${file} is missing`);
  });
});
