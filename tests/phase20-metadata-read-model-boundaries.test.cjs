const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function importApiModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(ROOT, relativePath)).href;
  return import(`${fileUrl}?phase20=${Date.now()}-${Math.random()}`);
}

test('manager route can include restaurant tools without widening menu access checks', () => {
  const routeSource = read('api/manager.js');

  assert.match(routeSource, /readIncludeFlags/);
  assert.match(routeSource, /includeFlags\.includes\('restaurant-tools'\)/);
  assert.match(routeSource, /requireRestaurantSpecialsAccess/);
  assert.match(routeSource, /readRestaurantToolsPayload/);
});

test('server write helpers degrade optional draft and source metadata cleanly', async () => {
  const helper = await importApiModule('server/_menu-write.js');
  const helperSource = read('server/_menu-write.js');

  assert.equal(typeof helper.patchMenuMetaForMenuWithCompatibility, 'function');
  assert.equal(typeof helper.normalizeAuditSource, 'function');
  assert.equal(typeof helper.inferAuditSource, 'function');
  assert.equal(helper.normalizeAuditSource('WEB_ADMIN'), 'web_admin');
  assert.equal(helper.inferAuditSource({ role: 'manager' }, ''), 'web_manager');
  assert.match(helperSource, /\/rest\/v1\/categories\?on_conflict=menu_id,key/);
  assert.match(helperSource, /operation_id/);
  assert.match(helperSource, /event_type/);
});

test('auth bootstrap route exposes compatibility config and readiness on the unified boundary', () => {
  const routeSource = read('server/_auth-proxy.js');

  assert.match(routeSource, /function buildCompatibilityConfig\(/);
  assert.match(routeSource, /function buildBootstrapReadiness\(/);
  assert.match(routeSource, /config: buildCompatibilityConfig\(\)/);
  assert.match(routeSource, /readiness:/);
  assert.match(routeSource, /includesConfig: true/);
});

test('draft command can clear shared drafts without a separate route', () => {
  const draftSource = read('server/_menu-draft.js');

  assert.match(draftSource, /status: draftExists \? 'draft_saved' : 'draft_cleared'/);
  assert.match(draftSource, /hasSharedDraft: draftExists/);
});
