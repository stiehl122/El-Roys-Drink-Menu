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

test('server live-save write path normalizes local item ids before persisting items', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const module = await importApiModule('server/_menu-write.js');
  const originalFetch = global.fetch;
  const fetchCalls = [];

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    fetchCalls.push({ url: href, options });

    if (href.includes('/menu_meta?')) {
      return {
        ok: true,
        async json() {
          return [{ last_updated_ts: 10 }];
        },
      };
    }

    if (href.includes('/categories?on_conflict=')) {
      return {
        ok: true,
        async json() {
          return [];
        },
      };
    }

    if (href.includes('/categories?menu_id=')) {
      return {
        ok: true,
        async json() {
          return [{ id: 'category-uuid-1', key: 'snacks' }];
        },
      };
    }

    if (href.includes('/items?category_id=in.(')) {
      return {
        ok: true,
        async json() {
          return [];
        },
      };
    }

    if (href.endsWith('/rest/v1/items')) {
      return {
        ok: true,
        async json() {
          return [];
        },
      };
    }

    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    await module.saveLiveMenuForMenu({
      menuId: '00000000-0000-0000-0000-000000000021',
      snapshot: {
        cats: [{
          id: 'local-category-1',
          key: 'snacks',
          label: 'Snacks',
          items: [{
            id: 'local-d41a9ab2-3952-4bc2-a278-854f3ca684bf',
            name: 'Fries',
            desc: 'Crispy fries',
          }],
        }],
        meta: {},
      },
      expectedLiveRevision: 10,
      actor: { id: 'user-1', name: 'Tester', role: 'manager' },
    });
  } finally {
    global.fetch = originalFetch;
  }

  const itemPersistCall = fetchCalls.find(call => call.url.endsWith('/rest/v1/items'));
  assert.ok(itemPersistCall, 'expected item persistence request');
  const payload = JSON.parse(itemPersistCall.options.body);
  assert.equal(payload.length, 1);
  assert.ok(!payload[0].id.startsWith('local-'));
  assert.match(payload[0].id, /^[0-9a-f-]{36}$/i);
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
  assert.doesNotMatch(deleteCategorySource, /await persistState\(\)/);
  assert.match(deleteCategorySource, /invalidateDiff\(\)/);
  assert.match(deleteCategorySource, /updateDraftIndicator\(\)/);
});

test('draft, live, preview, and publish boundaries enforce shared category governance before saving', () => {
  const draft = read('server/_menu-draft.js');
  const live = read('server/_menu-live.js');
  const publish = read('server/_menu-publish.js');

  assert.match(draft, /from '\.\/_category-governance\.js'/);
  assert.match(draft, /assertCategoryGovernanceAllowed\(/);
  assert.match(live, /from '\.\/_category-governance\.js'/);
  assert.match(live, /assertCategoryGovernanceAllowed\(/);
  assert.match(live, /requireCategorySnapshot:\s*true/);
  assert.match(publish, /from '\.\/_category-governance\.js'/);
  assert.match(publish, /assertCategoryGovernanceAllowed\(/);
  assert.match(publish, /requireCategorySnapshot:\s*true/);
});
