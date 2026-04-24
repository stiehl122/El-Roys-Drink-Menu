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
  return import(`${fileUrl}?wave1=${Date.now()}-${Math.random()}`);
}

function createJsonResponse(body, ok = true) {
  return {
    ok,
    async json() {
      return body;
    },
  };
}

test('consolidated read routes delegate through shared menu-read helpers', () => {
  const workspaceSource = read('api/manager.js');
  const publicSource = read('api/public.js');
  const bootstrapSource = read('api/auth.js');

  assert.match(workspaceSource, /from '\.\.\/server\/_menu-read\.js'/);
  assert.match(workspaceSource, /createMenuWorkspacePayload/);
  assert.match(workspaceSource, /readMenuStateBundle/);
  assert.match(workspaceSource, /requireAuthenticatedUser/);
  assert.match(workspaceSource, /requireMenuAccess/);

  assert.match(publicSource, /from '\.\.\/server\/_menu-read\.js'/);
  assert.match(publicSource, /createPublicMenuPayload/);
  assert.match(publicSource, /readMenuStateBundle/);

  assert.match(bootstrapSource, /createBootstrapResponse/);
  assert.match(bootstrapSource, /createProfileResponse/);
  assert.match(bootstrapSource, /executeAuthAction/);
  assert.match(bootstrapSource, /mode === 'profile'/);
});

test('shared menu read helper exposes stable wave 1 contract builders', async () => {
  const helper = await importApiModule('server/_menu-read.js');

  assert.equal(typeof helper.getKnownMenuById, 'function');
  assert.equal(typeof helper.getKnownMenus, 'function');
  assert.equal(typeof helper.getKnownRestaurants, 'function');
  assert.equal(typeof helper.readMenuStateBundle, 'function');
  assert.equal(typeof helper.createMenuWorkspacePayload, 'function');
  assert.equal(typeof helper.createPublicMenuPayload, 'function');
  assert.equal(typeof helper.createSessionBootstrapPayload, 'function');
});

test('consolidated read routes export request handlers', async () => {
  const workspaceRoute = await importApiModule('api/manager.js');
  const publicRoute = await importApiModule('api/public.js');
  const bootstrapRoute = await importApiModule('api/auth.js');

  assert.equal(typeof workspaceRoute.default, 'function');
  assert.equal(typeof publicRoute.default, 'function');
  assert.equal(typeof bootstrapRoute.default, 'function');
});

test('workspace payload preserves the live menu snapshot shape and adds staff context', async () => {
  const helper = await importApiModule('server/_menu-read.js');
  const bundle = {
    menu: {
      id: '00000000-0000-0000-0000-000000000020',
      restaurantId: '00000000-0000-0000-0000-000000000010',
      slug: 'leroys-lounge-drinks',
      type: 'drinks',
      name: "Leroy's Lounge Drinks",
    },
    cats: [{ key: 'beer', items: [{ id: 'draft-lager', name: 'Draft Lager', on_menu: true, visibility: 'public' }] }],
    meta: {
      last_updated_ts: 1712705100000,
      last_sent_ts: 1712705100000,
      last_sent_state: {
        beer: [{ id: 'draft-lager', name: 'Draft Lager', onMenu: true, visibility: 'public', eightySixed: false }],
      },
      last_sent_featured: [],
      draft_state: { cats: [{ key: 'beer', items: [] }] },
      draft_saved_ts: 1712705200000,
      draft_saved_by_user_id: 'user-1',
      draft_saved_by_name: 'Alex',
      draft_saved_source: 'web_manager',
    },
    restaurant: {
      id: '00000000-0000-0000-0000-000000000010',
      name: "Leroy's Lounge",
      slug: 'leroys-lounge',
      design: { accent: '#123' },
      use_custom_design: true,
    },
  };

  const payload = helper.createMenuWorkspacePayload(bundle, {
    actor: {
      id: 'user-1',
      name: 'Alex',
      role: 'manager',
      accessibleMenuIds: [
        '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000021',
      ],
    },
    restaurantTools: {
      restaurantId: '00000000-0000-0000-0000-000000000010',
      featuredGroups: [{ id: 'group-1', name: "Leroy's Lounge Specials", displayOrder: 0, slots: [] }],
      siblingCatalog: [{ id: 'item-1', name: 'Fries', menuId: '00000000-0000-0000-0000-000000000021' }],
    },
  });

  assert.deepEqual(payload.cats, [{
    id: 'featured-specials-00000000-0000-0000-0000-000000000020',
    menu_id: '00000000-0000-0000-0000-000000000020',
    key: 'featured_specials',
    label: 'Featured Specials',
    title: 'Featured Specials',
    icon: '⭐',
    color: 'rgba(190,67,48,0.12)',
    sub: 'Limited pours, specials, and deal items for this menu',
    placeholder: 'e.g. Happy Hour Margarita...',
    untappd_enabled: false,
    display_order: 0,
    items: [],
    fixed: true,
  }, {
    ...bundle.cats[0],
    untappd_enabled: false,
  }]);
  assert.equal(payload.meta.last_updated_ts, 1712705100000);
  assert.deepEqual(payload.meta.draft_state, bundle.meta.draft_state);
  assert.equal(payload.workspace.actor.role, 'manager');
  assert.equal(payload.workspace.permissions.canManage, true);
  assert.equal(payload.workspace.permissions.canAdmin, false);
  assert.equal(payload.workspace.permissions.canReadRestaurantTools, true);
  assert.equal(payload.workspace.sharedDraft.exists, true);
  assert.equal(payload.workspace.sharedDraft.savedAt, 1712705200000);
  assert.deepEqual(payload.workspace.sharedDraft.savedBy, { id: 'user-1', name: 'Alex' });
  assert.equal(payload.workspace.sharedDraft.source, 'web_manager');
  assert.equal(payload.workspace.publishState.status, 'live');
  assert.equal(payload.workspace.publishState.statusLabel, 'Live');
  assert.equal(payload.workspace.publishState.hasUnsentChanges, false);
  assert.equal(payload.workspace.publishState.revisions.liveRevision, 1712705100000);
  assert.equal(payload.workspace.publishState.revisions.notificationRevision, 1712705100000);
  assert.deepEqual(payload.workspace.publishState.queue.unsentItemIds, []);
  assert.equal(payload.workspace.revisions.liveRevision, 1712705100000);
  assert.equal(payload.workspace.revisions.draftRevision, 1712705200000);
  assert.equal(payload.workspace.revisions.lastSentRevision, 1712705100000);
  assert.equal(payload.workspace.revisions.notificationBaselineRevision, 1712705100000);
  assert.equal(payload.workspace.capabilities.includesDraftAuthorship, true);
  assert.equal(payload.workspace.capabilities.includesRestaurantTools, true);
  assert.equal(payload.workspace.capabilities.canSaveQuietly, true);
  assert.equal(payload.restaurantTools.restaurantId, '00000000-0000-0000-0000-000000000010');
  assert.equal(payload.context.kind, 'menu-workspace');
  assert.equal(payload.compatibility.contract, 'menu-workspace.v4');
});

test('workspace payload projects server-owned Live | Unsent queue state from stable item IDs', async () => {
  const helper = await importApiModule('server/_menu-read.js');
  const payload = helper.createMenuWorkspacePayload({
    menu: {
      id: '00000000-0000-0000-0000-000000000020',
      restaurantId: '00000000-0000-0000-0000-000000000010',
      slug: 'leroys-lounge-drinks',
      type: 'drinks',
      name: "Leroy's Lounge Drinks",
    },
    cats: [{ key: 'beer', label: 'Beer', icon: '🍺', items: [{ id: 'item-1', name: 'New Lager', on_menu: true, visibility: 'public' }] }],
    meta: {
      last_updated_ts: 1712705300000,
      last_sent_ts: 1712705100000,
      last_sent_state: {
        beer: [{ id: 'item-1', name: 'Old Lager', onMenu: true, visibility: 'public', eightySixed: false }],
      },
      last_sent_featured: [],
    },
    featuredCurrentIds: [],
    restaurant: null,
  }, {
    actor: { id: 'user-1', name: 'Alex', role: 'manager', accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'] },
  });

  assert.equal(payload.workspace.publishState.status, 'live_unsent');
  assert.equal(payload.workspace.publishState.statusLabel, 'Live | Unsent');
  assert.equal(payload.workspace.publishState.hasUnsentChanges, true);
  assert.equal(payload.workspace.publishState.revisions.notificationRevision, 1712705100000);
  assert.deepEqual(payload.workspace.publishState.queue.unsentItemIds, ['item-1']);
  assert.equal(payload.workspace.revisions.liveRevision, 1712705300000);
  assert.equal(payload.workspace.revisions.draftRevision, null);
  assert.equal(payload.workspace.revisions.lastSentRevision, 1712705100000);
  assert.equal(payload.workspace.revisions.notificationBaselineRevision, 1712705100000);
  assert.ok(payload.workspace.publishState.queue.selectableGroupIds.some(groupId => groupId.includes('rename')));
});

test('workspace payload treats legacy last_sent_featured as the featured_specials baseline during migration', async () => {
  const helper = await importApiModule('server/_menu-read.js');
  const payload = helper.createMenuWorkspacePayload({
    menu: {
      id: '00000000-0000-0000-0000-000000000020',
      restaurantId: '00000000-0000-0000-0000-000000000010',
      slug: 'leroys-lounge-drinks',
      type: 'drinks',
      name: "Leroy's Lounge Drinks",
    },
    cats: [{
      key: 'featured_specials',
      label: 'Featured Specials',
      icon: '⭐',
      items: [{ id: 'special-1', name: 'Happy Hour Marg', featured_enabled: true, on_menu: true, visibility: 'public' }],
    }],
    meta: {
      last_updated_ts: 1712705300000,
      last_sent_ts: 1712705100000,
      last_sent_state: {
        featured_specials: [{ id: 'special-1', name: 'Happy Hour Marg', onMenu: true, visibility: 'public', eightySixed: false }],
      },
      last_sent_featured: ['special-1'],
    },
    restaurant: null,
  }, {
    actor: { id: 'user-1', name: 'Alex', role: 'manager', accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'] },
  });

  assert.equal(payload.workspace.publishState.status, 'live');
  assert.equal(payload.workspace.publishState.hasUnsentChanges, false);
  assert.deepEqual(payload.workspace.publishState.queue.unsentItemIds, []);
  assert.deepEqual(payload.workspace.publishState.queue.sections, []);
});

test('readMenuStateBundle canonicalizes workspace category and item ordering', async () => {
  const helper = await importApiModule('server/_menu-read.js');
  const menu = helper.getKnownMenus()[0];
  assert.ok(menu?.id, 'expected a known menu id for readMenuStateBundle coverage');

  const originalFetch = global.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  global.fetch = async url => {
    const requestUrl = String(url);

    if (requestUrl.includes('/rest/v1/menus?')) {
      return createJsonResponse([{
        id: menu.id,
        slug: menu.slug,
        name: menu.name,
        type: menu.type,
        restaurant_id: menu.restaurantId,
        archived: false,
      }]);
    }

    if (requestUrl.includes('/rest/v1/categories?')) {
      return createJsonResponse([
        {
          id: 'cat-b',
          menu_id: menu.id,
          key: 'wine',
          label: 'Wine',
          display_order: 0,
          items: [
            { id: 'wine-b', name: 'Bordeaux', display_order: 1, on_menu: true, visibility: 'public' },
            { id: 'wine-a', name: 'Albarino', display_order: 1, on_menu: true, visibility: 'public' },
            { id: 'wine-c', name: 'Chianti', display_order: 0, on_menu: true, visibility: 'public' },
          ],
        },
        {
          id: 'cat-u',
          menu_id: menu.id,
          key: '__uncategorized__',
          label: 'Uncategorized',
          display_order: 0,
          items: [
            { id: 'uncat-a', name: 'Hidden', display_order: 0, on_menu: false, visibility: 'off_menu' },
          ],
        },
        {
          id: 'cat-a',
          menu_id: menu.id,
          key: 'beer',
          label: 'Beer',
          display_order: 0,
          items: [
            { id: 'beer-b', name: 'Z Lager', display_order: 1, on_menu: true, visibility: 'public' },
            { id: 'beer-a', name: 'A Lager', display_order: 1, on_menu: true, visibility: 'public' },
          ],
        },
      ]);
    }

    if (requestUrl.includes('/rest/v1/menu_meta?')) {
      return createJsonResponse([{ last_updated_ts: 1712705100000 }]);
    }

    if (requestUrl.includes('/rest/v1/restaurants?')) {
      return createJsonResponse([{
        id: menu.restaurantId,
        name: 'Restaurant',
        slug: 'restaurant',
        design: {},
        use_custom_design: false,
      }]);
    }

    if (requestUrl.includes('/rest/v1/featured_groups?')) {
      return createJsonResponse([]);
    }

    if (requestUrl.includes('/rest/v1/featured_slots?')) {
      return createJsonResponse([]);
    }

    throw new Error(`Unexpected fetch in test: ${requestUrl}`);
  };

  try {
    const bundle = await helper.readMenuStateBundle(menu.id);
    assert.deepEqual(bundle.cats.map(category => category.key), ['beer', 'wine', '__uncategorized__']);
    assert.deepEqual(bundle.cats[0].items.map(item => item.id), ['beer-a', 'beer-b']);
    assert.deepEqual(bundle.cats[1].items.map(item => item.id), ['wine-c', 'wine-a', 'wine-b']);
  } finally {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceKey;
  }
});

test('readMenuStateBundle backfills legacy restaurant-wide featured rows into featured_specials when no menu-owned items exist', async () => {
  const helper = await importApiModule('server/_menu-read.js');
  const menu = helper.getKnownMenus()[0];
  assert.ok(menu?.id, 'expected a known menu id for legacy featured backfill coverage');

  const originalFetch = global.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  global.fetch = async url => {
    const requestUrl = String(url);

    if (requestUrl.includes('/rest/v1/menus?')) {
      return createJsonResponse([{
        id: menu.id,
        slug: menu.slug,
        name: menu.name,
        type: menu.type,
        restaurant_id: menu.restaurantId,
        archived: false,
      }]);
    }

    if (requestUrl.includes('/rest/v1/categories?')) {
      return createJsonResponse([
        {
          id: 'cat-cocktails',
          menu_id: menu.id,
          key: 'cocktails',
          label: 'Cocktails',
          display_order: 1,
          items: [
            { id: 'cocktail-1', name: 'House Marg', display_order: 0, on_menu: false, visibility: 'off_menu' },
            { id: 'cocktail-2', name: 'Paloma', display_order: 1, on_menu: true, visibility: 'public' },
          ],
        },
      ]);
    }

    if (requestUrl.includes('/rest/v1/menu_meta?')) {
      return createJsonResponse([{ last_updated_ts: 1712705100000 }]);
    }

    if (requestUrl.includes('/rest/v1/restaurants?')) {
      return createJsonResponse([{
        id: menu.restaurantId,
        name: 'Restaurant',
        slug: 'restaurant',
        design: {},
        use_custom_design: false,
      }]);
    }

    if (requestUrl.includes('/rest/v1/featured_groups?')) {
      return createJsonResponse([{ id: 'legacy-group-1' }]);
    }

    if (requestUrl.includes('/rest/v1/featured_slots?')) {
      return createJsonResponse([
        { item_id: 'cocktail-1' },
        { item_id: 'sibling-only-1' },
      ]);
    }

    throw new Error(`Unexpected fetch in test: ${requestUrl}`);
  };

  try {
    const bundle = await helper.readMenuStateBundle(menu.id);
    assert.equal(bundle.cats[0].key, 'featured_specials');
    assert.deepEqual(bundle.cats[0].items.map(item => item.id), ['cocktail-1']);
    assert.equal(bundle.cats[0].items[0].featured_enabled, true);
    assert.equal(bundle.cats[0].items[0].on_menu, true);
    assert.equal(bundle.cats[0].items[0].visibility, 'public');

    const publicPayload = helper.createPublicMenuPayload(bundle);
    assert.deepEqual(publicPayload.featuredItems.map(item => item.id), ['cocktail-1']);
    assert.deepEqual(publicPayload.cats.map(category => category.key), ['cocktails']);
  } finally {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceKey;
  }
});

test('public payload strips staff-only menu metadata and filters non-public items', async () => {
  const helper = await importApiModule('server/_menu-read.js');
  const payload = helper.createPublicMenuPayload({
    menu: {
      id: '00000000-0000-0000-0000-000000000020',
      restaurantId: '00000000-0000-0000-0000-000000000010',
      slug: 'leroys-lounge-drinks',
      type: 'drinks',
      name: "Leroy's Lounge Drinks",
    },
    cats: [
      {
        key: 'beer',
        items: [
          { id: 'lager', on_menu: true, visibility: 'public' },
          { id: 'hidden', on_menu: false, visibility: 'public' },
        ],
      },
      {
        key: '__uncategorized__',
        items: [{ id: 'uncat', on_menu: false, visibility: 'public' }],
      },
    ],
    meta: {
      bot_id: 'secret-bot',
      notifications: { groupme: true },
      draft_state: { cats: [] },
      draft_saved_ts: 1712705200000,
      last_updated_ts: 1712705100000,
      last_sent_ts: 1712705150000,
      last_sent_categories: ['beer'],
    },
    restaurant: {
      id: '00000000-0000-0000-0000-000000000010',
      name: "Leroy's Lounge",
      slug: 'leroys-lounge',
      design: { accent: '#123' },
      use_custom_design: true,
    },
  });

  assert.equal(payload.context.kind, 'menu-public');
  assert.equal(payload.cats.length, 1);
  assert.equal(payload.cats[0].items.length, 1);
  assert.equal(payload.meta.last_updated_ts, 1712705100000);
  assert.equal(payload.meta.last_sent_ts, 1712705150000);
  assert.deepEqual(payload.meta.last_sent_categories, ['beer']);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.meta, 'draft_state'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.meta, 'bot_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.meta, 'last_sent_featured'), false);
});

test('legacy last_sent_featured does not create false featured_specials queue lines', async () => {
  const queueHelper = await importApiModule('server/_menu-queue.js');
  const snapshot = {
    cats: [{
      key: 'featured_specials',
      label: 'Featured Specials',
      icon: '⭐',
      items: [{ id: 'special-1', name: 'Happy Hour Marg', featured_enabled: true, on_menu: true, visibility: 'public' }],
    }],
  };
  const lastSentState = queueHelper.normalizeLegacyFeaturedBaseline({
    snapshot,
    lastSentState: {},
    lastSentFeatured: ['special-1'],
  });
  const queueState = queueHelper.buildCategoryQueueState({
    snapshot,
    lastSentState,
  });

  assert.deepEqual(lastSentState.featured_specials, [{
    id: 'special-1',
    name: 'Happy Hour Marg',
    featured_enabled: true,
    on_menu: true,
    visibility: 'public',
    featuredEnabled: true,
  }]);
  assert.equal(queueState.hasNotificationChanges, false);
  assert.deepEqual(queueState.groups, []);
  assert.deepEqual(queueState.diff, []);
  assert.deepEqual(queueState.unsentItemIds, []);
});

test('legacy last_sent_featured still surfaces a first-cutover featured_specials removal from lookup state', async () => {
  const queueHelper = await importApiModule('server/_menu-queue.js');
  const snapshot = {
    cats: [
      {
        key: 'featured_specials',
        label: 'Featured Specials',
        icon: '⭐',
        items: [],
      },
      {
        key: 'cocktails',
        label: 'Cocktails',
        icon: '🍹',
        items: [{ id: 'legacy-1', name: 'House Marg', featured_enabled: false, on_menu: true, visibility: 'public' }],
      },
    ],
  };
  const lastSentState = queueHelper.normalizeLegacyFeaturedBaseline({
    snapshot,
    lastSentState: {
      cocktails: [{ id: 'legacy-1', name: 'House Marg', onMenu: true, visibility: 'public', eightySixed: false }],
    },
    lastSentFeatured: ['legacy-1'],
  });
  const queueState = queueHelper.buildCategoryQueueState({
    snapshot,
    lastSentState,
  });

  assert.equal(lastSentState.featured_specials.length, 1);
  assert.equal(lastSentState.featured_specials[0].id, 'legacy-1');
  assert.equal(lastSentState.featured_specials[0].name, 'House Marg');
  assert.equal(lastSentState.featured_specials[0].featured_enabled, true);
  assert.equal(lastSentState.featured_specials[0].featuredEnabled, true);
  assert.equal(lastSentState.featured_specials[0].on_menu, true);
  assert.equal(lastSentState.featured_specials[0].visibility, 'public');
  assert.equal(queueState.hasNotificationChanges, true);
  assert.deepEqual(queueState.diff, [{
    id: 'featured_specials',
    icon: '⭐',
    label: 'Featured Specials',
    displayOrder: 0,
    added: [],
    removed: ['House Marg'],
    eightySixed: [],
    restored: [],
  }]);
  assert.deepEqual(queueState.unsentItemIds, []);
});

test('legacy featured objects prefer item_id over wrapper id during migration', async () => {
  const queueHelper = await importApiModule('server/_menu-queue.js');
  const snapshot = {
    cats: [{
      key: 'featured_specials',
      label: 'Featured Specials',
      icon: '⭐',
      items: [{ id: 'item-1', name: 'House Marg', featured_enabled: true, on_menu: true, visibility: 'public' }],
    }],
  };
  const lastSentState = queueHelper.normalizeLegacyFeaturedBaseline({
    snapshot,
    lastSentState: {},
    lastSentFeatured: [{
      id: 'slot-1',
      item_id: 'item-1',
      name: 'House Marg',
    }],
  });
  const queueState = queueHelper.buildCategoryQueueState({
    snapshot,
    lastSentState,
  });

  assert.equal(lastSentState.featured_specials.length, 1);
  assert.deepEqual(lastSentState.featured_specials.map(item => item.id), ['item-1']);
  assert.equal(lastSentState.featured_specials[0].name, 'House Marg');
  assert.equal(queueState.hasNotificationChanges, false);
  assert.deepEqual(queueState.diff, []);
  assert.deepEqual(queueState.unsentItemIds, []);
});

test('workspace payload keeps rename, 86, and restore queue lines for enabled featured_specials items', async () => {
  const helper = await importApiModule('server/_menu-read.js');
  const payload = helper.createMenuWorkspacePayload({
    menu: {
      id: '00000000-0000-0000-0000-000000000020',
      restaurantId: '00000000-0000-0000-0000-000000000010',
      slug: 'leroys-lounge-drinks',
      type: 'drinks',
      name: "Leroy's Lounge Drinks",
    },
    cats: [{
      key: 'featured_specials',
      label: 'Featured Specials',
      icon: '⭐',
      items: [
        { id: 'special-rename', name: 'After Party Marg', featured_enabled: true, on_menu: true, visibility: 'public' },
        { id: 'special-86', name: 'Back Bar Deal', featured_enabled: true, on_menu: true, visibility: 'public', is_eighty_sixed: true },
        { id: 'special-restore', name: 'Night Cap Shot', featured_enabled: true, on_menu: true, visibility: 'public', is_eighty_sixed: false },
        { id: 'special-hidden-eighty', name: 'Dormant Frozen Pour', featured_enabled: true, on_menu: true, visibility: 'public', is_eighty_sixed: true },
      ],
    }],
    meta: {
      last_updated_ts: 1712705300000,
      last_sent_ts: 1712705100000,
      last_sent_state: {
        featured_specials: [
          { id: 'special-rename', name: 'Before Party Marg', featured_enabled: true, onMenu: true, visibility: 'public', eightySixed: false },
          { id: 'special-86', name: 'Back Bar Deal', featured_enabled: true, onMenu: true, visibility: 'public', eightySixed: false },
          { id: 'special-restore', name: 'Night Cap Shot', featured_enabled: true, onMenu: true, visibility: 'public', eightySixed: true },
          { id: 'special-hidden-eighty', name: 'Dormant Frozen Pour', featured_enabled: false, onMenu: true, visibility: 'public', eightySixed: true },
        ],
      },
      last_sent_featured: [],
    },
    restaurant: null,
  }, {
    actor: { id: 'user-1', name: 'Alex', role: 'manager', accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'] },
  });

  assert.equal(payload.workspace.publishState.status, 'live_unsent');
  assert.deepEqual(payload.workspace.publishState.queue.unsentItemIds, [
    'special-rename',
    'special-86',
    'special-restore',
    'special-hidden-eighty',
  ]);
  assert.deepEqual(payload.workspace.publishState.queue.sections, [{
    id: 'featured_specials',
    icon: '⭐',
    label: 'Featured Specials',
    displayOrder: 0,
    added: ['Dormant Frozen Pour', 'After Party Marg'],
    removed: ['Before Party Marg'],
    eightySixed: ['Back Bar Deal'],
    restored: ['Night Cap Shot'],
  }]);
  assert.ok(payload.workspace.publishState.queue.selectableGroupIds.some(groupId => groupId.includes('rename')));
  assert.ok(payload.workspace.publishState.queue.selectableGroupIds.some(groupId => groupId.includes('eightySixed')));
  assert.ok(payload.workspace.publishState.queue.selectableGroupIds.some(groupId => groupId.includes('restored')));
  assert.ok(payload.workspace.publishState.queue.selectableGroupIds.some(groupId => groupId.includes('added')));
});

test('normal categories do not treat hidden eighty-sixed items as added queue lines', async () => {
  const queueHelper = await importApiModule('server/_menu-queue.js');
  const queueState = queueHelper.buildCategoryQueueState({
    snapshot: {
      cats: [{
        key: 'cocktails',
        label: 'Cocktails',
        icon: '🍹',
        items: [
          { id: 'cocktail-hidden-eighty', name: 'After Hours Marg', on_menu: true, visibility: 'public', is_eighty_sixed: true },
        ],
      }],
    },
    lastSentState: {
      cocktails: [
        { id: 'cocktail-hidden-eighty', name: 'After Hours Marg', onMenu: false, visibility: 'public', eightySixed: true },
      ],
    },
  });

  assert.equal(queueState.hasNotificationChanges, false);
  assert.deepEqual(queueState.diff, []);
  assert.deepEqual(queueState.unsentItemIds, []);
});

test('server readers normalize legacy special categories and last_sent_state into featured_specials', async () => {
  const helper = await importApiModule('server/_menu-read.js');
  const payload = helper.createMenuWorkspacePayload({
    menu: {
      id: '00000000-0000-0000-0000-000000000020',
      restaurantId: '00000000-0000-0000-0000-000000000010',
      slug: 'leroys-lounge-drinks',
      type: 'drinks',
      name: "Leroy's Lounge Drinks",
    },
    cats: [{
      key: 'special',
      label: 'Monthly Specials',
      icon: '⭐',
      items: [{ id: 'legacy-special-1', name: 'Happy Hour Marg', on_menu: true, visibility: 'public' }],
    }],
    meta: {
      last_updated_ts: 1712705300000,
      last_sent_ts: 1712705100000,
      last_sent_state: {
        special: [{ id: 'legacy-special-1', name: 'Happy Hour Marg', onMenu: true, visibility: 'public' }],
      },
      last_sent_featured: [],
    },
    restaurant: null,
  }, {
    actor: { id: 'user-1', name: 'Alex', role: 'manager', accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'] },
  });

  assert.deepEqual(payload.cats.map(category => category.key), ['featured_specials']);
  assert.equal(payload.cats[0].items[0].featured_enabled, true);
  assert.equal(payload.meta.last_sent_state.featured_specials[0].featured_enabled, true);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.meta.last_sent_state, 'special'), false);
  assert.equal(payload.workspace.publishState.status, 'live');
  assert.equal(payload.workspace.publishState.hasUnsentChanges, false);
  assert.deepEqual(payload.workspace.publishState.queue.unsentItemIds, []);
  assert.deepEqual(payload.workspace.publishState.queue.sections, []);
});

test('createPublicMenuPayload canonicalizes category and item ordering', async () => {
  const helper = await importApiModule('server/_menu-read.js');
  const payload = helper.createPublicMenuPayload({
    menu: {
      id: 'menu-1',
      slug: 'drinks',
      name: 'Drinks',
      type: 'drinks',
      restaurantId: 'rest-1',
    },
    cats: [
      {
        id: 'cat-c',
        menu_id: 'menu-1',
        key: 'amaro',
        label: 'Amaro',
        display_order: 0,
        items: [
          { id: 'amaro-1', name: 'Averna', display_order: 2, on_menu: true, visibility: 'public' },
        ],
      },
      {
        id: 'cat-z',
        menu_id: 'menu-1',
        key: 'wine',
        label: 'Wine',
        display_order: 2,
        items: [
          { id: 'item-b', name: 'Bordeaux', display_order: 1, on_menu: true, visibility: 'public' },
          { id: 'item-a', name: 'Albarino', display_order: 1, on_menu: true, visibility: 'public' },
          { id: 'item-c', name: 'Chianti', display_order: 0, on_menu: true, visibility: 'public' },
        ],
      },
      {
        id: 'cat-u',
        menu_id: 'menu-1',
        key: '__uncategorized__',
        label: 'Uncategorized',
        display_order: 0,
        items: [
          { id: 'hidden-1', name: 'Hidden', display_order: 0, on_menu: false, visibility: 'off_menu' },
        ],
      },
      {
        id: 'cat-a',
        menu_id: 'menu-1',
        key: 'beer',
        label: 'Beer',
        display_order: 0,
        items: [
          { id: 'beer-2', name: 'Z Lager', display_order: 1, on_menu: true, visibility: 'public' },
          { id: 'beer-1', name: 'A Lager', display_order: 1, on_menu: true, visibility: 'public' },
        ],
      },
    ],
    meta: {},
    restaurant: null,
  });

  assert.deepEqual(payload.cats.map(category => category.key), ['amaro', 'beer', 'wine']);
  assert.equal(payload.cats[0].id, 'cat-c');
  assert.deepEqual(payload.cats[1].items.map(item => item.id), ['beer-1', 'beer-2']);
  assert.deepEqual(payload.cats[2].items.map(item => item.id), ['item-c', 'item-a', 'item-b']);
});

test('public payload hides featured_specials category and emits featuredItems instead', async () => {
  const helper = await importApiModule('server/_menu-read.js');
  const payload = helper.createPublicMenuPayload({
    menu: { id: 'menu-main', restaurantId: 'restaurant-main', type: 'drinks' },
    cats: [
      {
        key: 'featured_specials',
        label: 'Featured Specials',
        display_order: 0,
        items: [
          { id: 'special-1', name: 'Happy Hour Marg', featured_enabled: true, on_menu: true, visibility: 'public' },
          { id: 'special-2', name: 'Old Seasonal', featured_enabled: false, on_menu: true, visibility: 'public' },
        ],
      },
      {
        key: 'cocktails',
        label: 'Cocktails',
        display_order: 1,
        items: [{ id: 'cocktail-1', name: 'Paloma', on_menu: true, visibility: 'public' }],
      },
    ],
    meta: {},
    restaurant: null,
  });

  assert.deepEqual(payload.cats.map(category => category.key), ['cocktails']);
  assert.deepEqual(payload.featuredItems.map(item => item.id), ['special-1']);
});

test('session bootstrap payload exposes actor capabilities against the fixed menu registry', async () => {
  const helper = await importApiModule('server/_menu-read.js');
  const payload = helper.createSessionBootstrapPayload({
    actor: { id: 'user-1', role: 'manager', name: 'Alex' },
    accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'],
  });

  assert.equal(payload.actor.role, 'manager');
  assert.equal(typeof payload.appVersion, 'string');
  assert.equal(payload.defaultMenuId, '00000000-0000-0000-0000-000000000020');
  assert.equal(payload.capabilities.canAccessManager, true);
  assert.equal(payload.capabilities.canAccessAdmin, false);
  assert.equal(payload.capabilities.canManageAnyMenu, true);
  assert.ok(Array.isArray(payload.restaurants));
  assert.equal(payload.menus.length, 4);
  assert.equal(payload.menus.filter(menu => menu.canManage).length, 1);
});

test('app runtime prefers consolidated server read routes before direct supabase reads', () => {
  const source = read('app.js');
  assert.match(source, /\/api\/manager\?/);
  assert.match(source, /\/api\/public\?/);
  assert.match(source, /if \(workspace\) return workspace;/);
  assert.match(source, /if \(projection\) return projection;/);
});
