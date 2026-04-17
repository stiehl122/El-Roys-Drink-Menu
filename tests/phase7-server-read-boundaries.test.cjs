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

  assert.deepEqual(payload.cats, bundle.cats);
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
      last_sent_featured: ['featured-1'],
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
  assert.deepEqual(payload.meta.last_sent_featured, ['featured-1']);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.meta, 'draft_state'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.meta, 'bot_id'), false);
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
