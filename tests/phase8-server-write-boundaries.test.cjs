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

test('server live-save write path round-trips featured_enabled into persisted item rows', async () => {
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
          return [{ id: 'category-uuid-1', key: 'featured_specials' }];
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
          id: 'featured-specials-local',
          key: 'featured_specials',
          label: 'Featured Specials',
          items: [{
            id: 'special-1',
            name: 'Happy Hour Marg',
            desc: 'Spicy and bright',
            featured_enabled: true,
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
  assert.equal(payload[0].id, 'special-1');
  assert.equal(payload[0].featured_enabled, true);
});

test('server live-save write path clones featured_specials items when they reuse a base menu item id', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const module = await importApiModule('server/_menu-write.js');
  const originalFetch = global.fetch;
  const fetchCalls = [];
  const sharedItemId = '11111111-1111-4111-8111-111111111111';

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
          return [
            { id: 'cocktails-cat', key: 'cocktails' },
            { id: 'featured-cat', key: 'featured_specials' },
          ];
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
      menuId: '00000000-0000-0000-0000-000000000020',
      snapshot: {
        cats: [
          {
            id: 'cocktails',
            key: 'cocktails',
            label: 'Cocktails',
            items: [{ id: sharedItemId, name: 'House Marg' }],
          },
          {
            id: 'featured-specials-local',
            key: 'featured_specials',
            label: 'Featured Specials',
            items: [{ id: sharedItemId, name: 'House Marg', featured_enabled: true }],
          },
        ],
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
  assert.equal(payload.length, 2);

  const regularItem = payload.find(item => item.category_id === 'cocktails-cat');
  const featuredItem = payload.find(item => item.category_id === 'featured-cat');
  assert.ok(regularItem, 'expected regular item row');
  assert.ok(featuredItem, 'expected featured item row');
  assert.equal(regularItem.id, sharedItemId);
  assert.notEqual(featuredItem.id, sharedItemId);
  assert.match(featuredItem.id, /^[0-9a-f-]{36}$/i);
  assert.equal(featuredItem.featured_enabled, true);
});

test('server live-save write path preserves existing featured_specials when a legacy snapshot omits the category', async () => {
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

    if (href.includes('/categories?menu_id=eq.')) {
      return {
        ok: true,
        async json() {
          return [
            { id: 'cocktails-cat', key: 'cocktails' },
            { id: 'featured-cat', key: 'featured_specials' },
          ];
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

    if (options.method === 'DELETE' && href.includes('/rest/v1/categories?id=in.(')) {
      throw new Error(`Unexpected category delete: ${href}`);
    }

    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    await module.saveLiveMenuForMenu({
      menuId: '00000000-0000-0000-0000-000000000020',
      snapshot: {
        cats: [{
          id: 'cocktails',
          key: 'cocktails',
          label: 'Cocktails',
          items: [{ id: 'item-1', name: 'House Marg' }],
        }],
        featuredGroups: [{
          id: 'legacy-featured',
          slots: [{ itemId: 'item-1', item: { id: 'item-1', name: 'House Marg' } }],
        }],
        meta: {},
      },
      expectedLiveRevision: 10,
      actor: { id: 'user-1', name: 'Tester', role: 'manager' },
    });
  } finally {
    global.fetch = originalFetch;
  }

  const managedItemsCall = fetchCalls.find(call => call.url.includes('/items?category_id=in.('));
  assert.ok(managedItemsCall, 'expected existing item lookup');
  assert.match(managedItemsCall.url, /cocktails-cat/);
  assert.doesNotMatch(managedItemsCall.url, /featured-cat/);
});

test('saveLiveMenuCommand resolves DB category ids and persists featured_enabled', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const module = await importApiModule('server/_menu-live.js');
  const originalFetch = global.fetch;
  const fetchCalls = [];
  const menuId = '00000000-0000-0000-0000-000000000020';

  function ok(payload) {
    return {
      ok: true,
      async json() {
        return payload;
      },
    };
  }

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    fetchCalls.push({ url: href, options });

    if (href.includes('/auth/v1/user')) {
      return ok({ id: 'user-1' });
    }

    if (href.includes('/rest/v1/profiles?id=eq.user-1&select=role,name')) {
      return ok([{ role: 'admin', name: 'Admin Tester' }]);
    }

    if (href.includes(`/rest/v1/menu_meta?menu_id=eq.${menuId}&select=*&limit=1`)) {
      return ok([{ last_updated_ts: 10, draft_saved_ts: null, last_sent_ts: null }]);
    }

    if (href.includes(`/rest/v1/menus?id=eq.${menuId}&select=id,restaurant_id,type,archived&limit=1`)) {
      return ok([{
        id: menuId,
        restaurant_id: '00000000-0000-0000-0000-000000000010',
        type: 'drinks',
        archived: false,
      }]);
    }

    if (href.includes(`/rest/v1/categories?menu_id=eq.${menuId}&select=id,key`)) {
      return ok([
        { id: 'category-uuid-1', key: 'featured_specials' },
        { id: 'uncategorized-uuid-1', key: '__uncategorized__' },
      ]);
    }

    if (href.includes('/categories?on_conflict=')) {
      return ok([]);
    }

    if (href.endsWith('/rest/v1/items')) {
      return ok([]);
    }

    if (href.includes('/menu_meta?on_conflict=menu_id')) {
      return ok([]);
    }

    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const result = await module.saveLiveMenuCommand({
      headers: { authorization: 'Bearer test-token' },
      body: {
        menu_id: menuId,
        snapshot: {
          cats: [{
            id: 'featured_specials',
            key: 'featured_specials',
            label: 'Featured Specials',
            icon: '⭐',
            items: [{
              id: 'special-1',
              name: 'Happy Hour Marg',
              featuredEnabled: true,
            }],
          }],
          meta: {},
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'live_saved');
  } finally {
    global.fetch = originalFetch;
  }

  const categoryPersistCall = fetchCalls.find(call => call.url.includes('/categories?on_conflict=menu_id,key'));
  assert.ok(categoryPersistCall, 'expected category persistence request');
  const categoryPayload = JSON.parse(categoryPersistCall.options.body);
  assert.equal(categoryPayload.length, 2);
  assert.equal(categoryPayload[0].key, 'featured_specials');
  assert.equal(Object.prototype.hasOwnProperty.call(categoryPayload[0], 'id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(categoryPayload[1], 'id'), false);
  assert.deepEqual(Object.keys(categoryPayload[0]).sort(), Object.keys(categoryPayload[1]).sort());

  const itemPersistCall = fetchCalls.find(call => call.url.endsWith('/rest/v1/items'));
  assert.ok(itemPersistCall, 'expected item persistence request');
  const itemPayload = JSON.parse(itemPersistCall.options.body);
  assert.equal(itemPayload.length, 1);
  assert.equal(itemPayload[0].category_id, 'category-uuid-1');
  assert.equal(itemPayload[0].featured_enabled, true);
});

test('saveLiveMenuCommand clones featured_specials items when they reuse a base menu item id', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const module = await importApiModule('server/_menu-live.js');
  const originalFetch = global.fetch;
  const fetchCalls = [];
  const menuId = '00000000-0000-0000-0000-000000000020';
  const sharedItemId = '11111111-1111-4111-8111-111111111111';

  function ok(payload) {
    return {
      ok: true,
      async json() {
        return payload;
      },
    };
  }

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    fetchCalls.push({ url: href, options });

    if (href.includes('/auth/v1/user')) {
      return ok({ id: 'user-1' });
    }

    if (href.includes('/rest/v1/profiles?id=eq.user-1&select=role,name')) {
      return ok([{ role: 'admin', name: 'Admin Tester' }]);
    }

    if (href.includes(`/rest/v1/menu_meta?menu_id=eq.${menuId}&select=*&limit=1`)) {
      return ok([{ last_updated_ts: 10, draft_saved_ts: null, last_sent_ts: null }]);
    }

    if (href.includes(`/rest/v1/menus?id=eq.${menuId}&select=id,restaurant_id,type,archived&limit=1`)) {
      return ok([{
        id: menuId,
        restaurant_id: '00000000-0000-0000-0000-000000000010',
        type: 'drinks',
        archived: false,
      }]);
    }

    if (href.includes(`/rest/v1/categories?menu_id=eq.${menuId}&select=id,key`)) {
      return ok([
        { id: 'cocktails-cat', key: 'cocktails' },
        { id: 'featured-cat', key: 'featured_specials' },
        { id: 'uncategorized-uuid-1', key: '__uncategorized__' },
      ]);
    }

    if (href.includes('/categories?on_conflict=')) {
      return ok([]);
    }

    if (href.endsWith('/rest/v1/items')) {
      return ok([]);
    }

    if (href.includes('/menu_meta?on_conflict=menu_id')) {
      return ok([]);
    }

    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    await module.saveLiveMenuCommand({
      headers: { authorization: 'Bearer test-token' },
      body: {
        menu_id: menuId,
        snapshot: {
          cats: [
            {
              id: 'cocktails',
              key: 'cocktails',
              label: 'Cocktails',
              items: [{ id: sharedItemId, name: 'House Marg' }],
            },
            {
              id: 'featured_specials',
              key: 'featured_specials',
              label: 'Featured Specials',
              items: [{ id: sharedItemId, name: 'House Marg', featuredEnabled: true }],
            },
          ],
          meta: {},
        },
      },
    });
  } finally {
    global.fetch = originalFetch;
  }

  const itemPersistCall = fetchCalls.find(call => call.url.endsWith('/rest/v1/items'));
  assert.ok(itemPersistCall, 'expected item persistence request');
  const itemPayload = JSON.parse(itemPersistCall.options.body);
  const regularItem = itemPayload.find(item => item.category_id === 'cocktails-cat');
  const featuredItem = itemPayload.find(item => item.category_id === 'featured-cat');
  assert.ok(regularItem, 'expected regular item row');
  assert.ok(featuredItem, 'expected featured item row');
  assert.equal(regularItem.id, sharedItemId);
  assert.notEqual(featuredItem.id, sharedItemId);
  assert.match(featuredItem.id, /^[0-9a-f-]{36}$/i);
  assert.equal(featuredItem.featured_enabled, true);
});

test('saveLiveMenuCommand does not persist admin-owned notifications or restaurant design from manager payloads', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const module = await importApiModule('server/_menu-live.js');
  const originalFetch = global.fetch;
  const fetchCalls = [];
  const menuId = '00000000-0000-0000-0000-000000000020';

  function ok(payload) {
    return {
      ok: true,
      async json() {
        return payload;
      },
    };
  }

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    fetchCalls.push({ url: href, options });

    if (href.includes('/auth/v1/user')) {
      return ok({ id: 'user-1' });
    }

    if (href.includes('/rest/v1/profiles?id=eq.user-1&select=role,name')) {
      return ok([{ role: 'manager', name: 'Manager Tester' }]);
    }

    if (href.includes(`/rest/v1/menu_access?user_id=eq.user-1&menu_id=in.(${menuId})&select=menu_id`)) {
      return ok([{ menu_id: menuId }]);
    }

    if (href.includes(`/rest/v1/menu_meta?menu_id=eq.${menuId}&select=*&limit=1`)) {
      return ok([{ last_updated_ts: 10, draft_saved_ts: null, last_sent_ts: null }]);
    }

    if (href.includes(`/rest/v1/menus?id=eq.${menuId}&select=id,name,slug,type,restaurant_id,archived&limit=1`)) {
      return ok([{
        id: menuId,
        name: 'Drinks',
        slug: 'drinks',
        restaurant_id: '00000000-0000-0000-0000-000000000010',
        type: 'drinks',
        archived: false,
      }]);
    }

    if (href.includes(`/rest/v1/menus?id=eq.${menuId}&select=id,restaurant_id,type,archived&limit=1`)) {
      return ok([{
        id: menuId,
        restaurant_id: '00000000-0000-0000-0000-000000000010',
        type: 'drinks',
        archived: false,
      }]);
    }

    if (href.includes(`/rest/v1/categories?menu_id=eq.${menuId}&select=*,items(*)&order=display_order.asc`)) {
      return ok([
        { id: 'cocktails-cat', key: 'cocktails', label: 'Cocktails', items: [] },
        { id: 'uncategorized-uuid-1', key: '__uncategorized__', label: 'Uncategorized', items: [] },
      ]);
    }

    if (href.includes(`/rest/v1/categories?menu_id=eq.${menuId}&select=id,key`)) {
      return ok([
        { id: 'cocktails-cat', key: 'cocktails' },
        { id: 'uncategorized-uuid-1', key: '__uncategorized__' },
      ]);
    }

    if (href.includes('/rest/v1/featured_groups?canonical_id=eq.leroyslounge-specials&select=id&limit=1')) {
      return ok([]);
    }

    if (href.includes('/categories?on_conflict=')) {
      return ok([]);
    }

    if (href.endsWith('/rest/v1/items')) {
      return ok([]);
    }

    if (href.includes('/menu_meta?on_conflict=menu_id')) {
      return ok([]);
    }

    if (
      href.includes('/rest/v1/restaurants?id=eq.') &&
      href.includes('&select=id,name,slug,design,use_custom_design&limit=1')
    ) {
      return ok([{
        id: '00000000-0000-0000-0000-000000000010',
        name: 'Leroy\'s Lounge',
        slug: 'leroyslounge',
        design: {},
        use_custom_design: false,
      }]);
    }

    if (href.includes('/rest/v1/restaurants?id=eq.') && options.method === 'PATCH') {
      throw new Error(`Unexpected restaurant design persistence: ${href}`);
    }

    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const result = await module.saveLiveMenuCommand({
      headers: { authorization: 'Bearer test-token' },
      body: {
        menu_id: menuId,
        snapshot: {
          cats: [{
            id: 'cocktails',
            key: 'cocktails',
            label: 'Cocktails',
            items: [{ id: 'item-1', name: 'House Marg' }],
          }],
          meta: {
            bot_id: 'legacy-bot-id',
            notifications: {
              groupme: { enabled: false },
              sms: { enabled: true },
            },
          },
          restaurant: {
            id: '00000000-0000-0000-0000-000000000010',
            design: { primaryColor: '#ff00ff' },
            use_custom_design: true,
          },
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.compatibility.restaurantDesignUpdated, false);
  } finally {
    global.fetch = originalFetch;
  }

  const metaPersistCall = fetchCalls.find(call => call.url.includes('/menu_meta?on_conflict=menu_id'));
  assert.ok(metaPersistCall, 'expected menu metadata persistence request');
  const metaPayload = JSON.parse(metaPersistCall.options.body);
  assert.equal(metaPayload.bot_id, 'legacy-bot-id');
  assert.equal(Object.prototype.hasOwnProperty.call(metaPayload, 'notifications'), false);
  assert.equal(fetchCalls.some(call => (
    call.url.includes('/rest/v1/restaurants?id=eq.') &&
    call.options.method === 'PATCH'
  )), false);
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
