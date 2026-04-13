const assert = require('node:assert/strict');
const test = require('node:test');

const { loadAppSandbox } = require('../helpers/runtime.cjs');

function createMenuSessionPorts(overrides = {}) {
  return {
    buildRequest: overridesRequest => ({
      pathname: '/leroyslounge',
      search: '?menu=leroys-lounge-drinks',
      pageMode: 'public',
      actor: null,
      siteRestaurantId: 'restaurant-main',
      requestedMenuId: 'menu-main',
      requestedMenuSlug: 'leroys-lounge-drinks',
      ...overridesRequest,
    }),
    buildSnapshot: (source, request) => ({ source, request }),
    resolveMenu: async () => null,
    canLoadFromNetwork: () => true,
    restoreFallback: ({ request }) => ({
      source: 'cache',
      usedFallback: true,
      snapshot: { source: 'cache', request },
    }),
    loadState: async ({ request, source = 'network' }) => ({ source, request }),
    pollState: async ({ request }) => ({
      changed: false,
      designChanged: false,
      snapshot: { source: 'poll', request },
    }),
    now: () => 1712705100000,
    persistState: async () => true,
    patchMenuMeta: async () => ({ downgradedFields: [] }),
    patchMenuMetaForMenu: async () => ({ downgradedFields: [] }),
    patchMenuDraftState: async () => ({ downgradedFields: [] }),
    commitDraft() {},
    commitLiveSave() {},
    buildPreview: snapshot => ({
      hasChanges: true,
      hasLocalDraft: false,
      hasSharedDraft: false,
      hasNotificationChanges: true,
      hasSaveOnlyChanges: false,
      diff: [],
      sections: [],
      notificationChanges: [],
      saveOnlyChanges: [],
      patchMessage: '',
      truncated: false,
      snapshot,
      mode: 'update-only',
    }),
    getMenuId: () => 'menu-main',
    getRestaurantId: () => 'restaurant-main',
    getMenuName: () => 'Main Menu',
    snapshotCurrentItemsAsLastSent: () => ({}),
    getCurrentFeaturedIds: () => [],
    canEditRestaurantSpecials: () => false,
    getRestaurantMenuIds: () => [],
    dispatchNotification: async () => ({ ok: true, statusCode: 200, partial: false, summary: {} }),
    collectNotificationWarnings: () => [],
    syncLocalCache: () => true,
    logUpdate: async () => true,
    commitPublished() {},
    dedupeWarnings: warnings => Array.from(new Set(warnings.filter(Boolean))),
    ...overrides,
  };
}

test('menu session lifecycle boundary handles redirect and fallback', async () => {
  const sandbox = loadAppSandbox();
  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts({
    resolveMenu: async ({ request }) => {
      if (request.requestedMenuSlug === 'el-roys') {
        return { redirect: { href: '/elroyscantina?menu=el-roys-cantina-drinks' } };
      }
      return null;
    },
    canLoadFromNetwork: ({ request }) => request.requestedMenuSlug !== 'fallback-only',
  }));

  const redirect = await lifecycle.open({ requestedMenuSlug: 'el-roys' });
  assert.equal(redirect.redirect.href, '/elroyscantina?menu=el-roys-cantina-drinks');

  const fallback = await lifecycle.open({ requestedMenuSlug: 'fallback-only' });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.usedFallback, true);
  assert.equal(fallback.showLoadError, false);
  assert.equal(fallback.snapshot.source, 'cache');
});

test('menu state loader boundary forwards wave 1 api projections through one loader contract', async () => {
  const sandbox = loadAppSandbox();
  const apiProjection = {
    cats: [{ key: 'beer', items: [{ id: 'lager' }] }],
    meta: {
      draft_state: { cats: [{ key: 'beer', items: [] }] },
      draft_saved_ts: 1712705200000,
    },
    restaurant: { id: 'restaurant-main', name: 'Main Restaurant' },
    workspace: {
      actor: { id: 'user-1', role: 'manager' },
      permissions: { canManage: true },
    },
  };
  let hydrated = null;
  let draftState = null;
  let cached = null;
  let clearCalls = 0;

  const service = sandbox.createMenuStateLoaderService({
    readState: async () => apiProjection,
    hydrateFromState: data => {
      hydrated = data;
    },
    applyPersistedDraftState: draft => {
      draftState = draft;
      return true;
    },
    setDefaultState: () => {
      throw new Error('should not fall back');
    },
    clearDraftChanges: () => {
      clearCalls += 1;
    },
    writeMenuCache: data => {
      cached = data;
    },
    refreshFeatured: async () => {},
    buildSnapshot: source => ({ source }),
  });

  const snapshot = await service.load({
    request: { pageMode: 'manager' },
    source: 'network',
  });

  assert.equal(snapshot.source, 'network');
  assert.equal(hydrated, apiProjection);
  assert.deepEqual(draftState, apiProjection.meta.draft_state);
  assert.equal(cached, apiProjection);
  assert.equal(clearCalls, 0);
});
