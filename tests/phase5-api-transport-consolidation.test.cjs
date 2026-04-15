const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('phase 5 shared api transport helper exports config, headers, and response helpers', () => {
  const source = read('server/_supabase.js');
  assert.match(source, /export\s+function\s+getSupabaseServerConfig/);
  assert.match(source, /export\s+function\s+serviceHeaders/);
  assert.match(source, /export\s+async\s+function\s+readJsonSafe/);
  assert.match(source, /export\s+function\s+getApiErrorMessage/);
  assert.doesNotMatch(source, /export\s+async\s+function\s+fetchSupabase/);
  assert.doesNotMatch(source, /export\s+async\s+function\s+fetchSupabaseJson/);
});

test('consolidated api routes consume shared supabase transport helper', () => {
  const admin = read('api/admin.js');
  const manager = read('api/manager.js');

  assert.match(admin, /from '\.\.\/server\/_admin-read-models\.js'/);
  assert.match(manager, /from '\.\.\/server\/_supabase\.js'/);
  assert.doesNotMatch(manager, /function\s+serviceHeaders\s*\(/);
  assert.doesNotMatch(manager, /function\s+readJsonSafe\s*\(/);
  assert.doesNotMatch(manager, /queryAction/);
  assert.doesNotMatch(manager, /action\s*===\s*'migrate'/);
});

test('manager route composes shared authorization and delivery boundaries', () => {
  const notify = read('api/manager.js');

  assert.match(notify, /from '\.\.\/server\/_notification-gateway\.js'/);
  assert.match(notify, /authorizeNotificationRequest/);
  assert.match(notify, /from '\.\.\/server\/_notification-delivery\.js'/);
  assert.match(notify, /deliverMenuNotification/);
  assert.match(notify, /from '\.\.\/server\/_supabase\.js'/);
  assert.doesNotMatch(notify, /serviceHeaders\s*\(/);
});
