const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const { loadAppSandbox } = require('./helpers/runtime.cjs');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function importApiModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(ROOT, relativePath)).href;
  return import(`${fileUrl}?wave2=${Date.now()}-${Math.random()}`);
}

test('consolidated manager and admin routes delegate through shared helpers', () => {
  const manager = read('api/manager.js');
  const adminSettings = read('api/admin.js');

  assert.match(manager, /from '\.\.\/server\/_menu-draft\.js'/);
  assert.match(manager, /saveSharedDraftCommand/);
  assert.match(manager, /from '\.\.\/server\/_menu-live\.js'/);
  assert.match(manager, /saveLiveMenuCommand/);
  assert.match(manager, /from '\.\.\/server\/_menu-publish\.js'/);
  assert.match(manager, /publishMenuUpdateForMenu/);
  assert.match(manager, /from '\.\.\/server\/_notification-delivery\.js'/);
  assert.match(adminSettings, /from '\.\.\/server\/_admin-settings\.js'/);
});

test('consolidated manager and admin routes export request handlers', async () => {
  const manager = await importApiModule('api/manager.js');
  const adminSettings = await importApiModule('api/admin.js');

  assert.equal(typeof manager.default, 'function');
  assert.equal(typeof adminSettings.default, 'function');
});

test('publish service boundary prefers the server-owned publish command when provided', async () => {
  const sandbox = loadAppSandbox();
  let publishCalls = 0;
  let dispatchCalls = 0;
  let persistCalls = 0;

  const lifecycle = sandbox.createMenuSessionLifecycle({
    buildRequest: () => ({ requestedMenuId: 'menu-main' }),
    buildSnapshot: source => ({ source, dirty: true }),
    buildPreview: snapshot => ({
      hasChanges: true,
      hasLocalDraft: true,
      hasSharedDraft: false,
      hasNotificationChanges: true,
      hasSaveOnlyChanges: false,
      diff: [{ id: 'beer' }],
      sections: [{ id: 'beer', changes: [] }],
      notificationChanges: [{ id: 'beer::added::lager' }],
      saveOnlyChanges: [],
      patchMessage: 'Patch',
      truncated: false,
      snapshot,
      mode: 'save',
    }),
    now: () => 1712705100000,
    patchMenuDraftState: async () => ({ downgradedFields: [] }),
    commitDraft() {},
    persistState: async () => {
      persistCalls += 1;
      return true;
    },
    patchMenuMeta: async () => ({ downgradedFields: [] }),
    patchMenuMetaForMenu: async () => ({ downgradedFields: [] }),
    dispatchNotification: async () => {
      dispatchCalls += 1;
      return { ok: true, statusCode: 200, partial: false, summary: {} };
    },
    publishMenuUpdate: async () => {
      publishCalls += 1;
      return { ok: true, successMessage: 'published' };
    },
  });

  const result = await lifecycle.publishUpdate({ notify: false });
  assert.equal(result.ok, true);
  assert.equal(publishCalls, 1);
  assert.equal(dispatchCalls, 0);
  assert.equal(persistCalls, 0);
});

test('app runtime routes draft, live, publish, and admin settings through consolidated APIs', () => {
  const source = read('app.js');

  assert.match(source, /\/api\/manager/);
  assert.match(source, /\/api\/admin/);
  assert.match(source, /action: 'save_draft'/);
  assert.match(source, /action: 'save_live'/);
  assert.match(source, /action: 'preview_publish'/);
  assert.match(source, /action: 'publish'/);
  assert.match(source, /expected_draft_revision/);
  assert.match(source, /expected_live_revision/);
  assert.match(source, /save_restaurant_design/);
});

test('category deletion no longer performs direct Supabase writes before the server save boundary', () => {
  const source = read('app.js');
  const start = source.indexOf('async function deleteCategory(catId)');
  const end = source.indexOf('function toggleAddCategoryForm()', start);
  const deleteCategorySource = source.slice(start, end);

  assert.doesNotMatch(deleteCategorySource, /await sbDeleteCategory/);
  assert.doesNotMatch(deleteCategorySource, /rest\/v1\/items/);
  assert.match(deleteCategorySource, /await persistState\(\)/);
});
