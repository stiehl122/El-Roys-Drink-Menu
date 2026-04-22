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

test('menu state loader boundary reapplies the stored local draft envelope on top of live workspace data', async () => {
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
  let appliedEnvelope = null;
  let cached = null;
  let clearCalls = 0;
  const draftEnvelope = {
    baseSnapshot: { cats: [{ key: 'beer', items: [{ id: 'lager' }] }] },
    draftSnapshot: { cats: [{ key: 'beer', items: [{ id: 'lager', name: 'Draft Lager' }] }] },
  };

  const service = sandbox.createMenuStateLoaderService({
    readState: async () => apiProjection,
    hydrateFromState: data => {
      hydrated = data;
    },
    readStoredLocalDraftEnvelope: () => draftEnvelope,
    alignLocalDraftEnvelope: envelope => envelope,
    applyLocalDraftEnvelope: envelope => {
      appliedEnvelope = envelope;
      return true;
    },
    syncLocalDraftDirtyState: () => true,
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
  assert.deepEqual(appliedEnvelope, draftEnvelope);
  assert.equal(cached, apiProjection);
  assert.equal(clearCalls, 0);
});

test('menu state loader boundary clears no-op stored local drafts instead of entering drafting state', async () => {
  const sandbox = loadAppSandbox();
  const clearDraftOptions = [];
  const dirtyStates = [];
  let clearCalls = 0;

  const service = sandbox.createMenuStateLoaderService({
    readState: async () => ({
      cats: [{ key: 'beer', items: [{ id: 'lager' }] }],
      meta: {},
      restaurant: { id: 'restaurant-main', name: 'Main Restaurant' },
      workspace: {
        actor: { id: 'user-1', role: 'manager' },
        permissions: { canManage: true },
      },
    }),
    hydrateFromState: () => {},
    readStoredLocalDraftEnvelope: () => ({
      baseSnapshot: { cats: [{ key: 'beer', items: [{ id: 'lager' }] }] },
      draftSnapshot: { cats: [{ key: 'beer', items: [{ id: 'lager' }] }] },
    }),
    alignLocalDraftEnvelope: envelope => envelope,
    applyLocalDraftEnvelope: () => true,
    syncLocalDraftDirtyState: () => false,
    clearCurrentLocalDraft: options => {
      clearDraftOptions.push(options);
    },
    setDirty: value => {
      dirtyStates.push(value);
    },
    clearDraftChanges: () => {
      clearCalls += 1;
    },
    writeMenuCache: () => {},
    refreshFeatured: async () => {},
    buildSnapshot: source => ({ source }),
  });

  const snapshot = await service.load({
    request: { pageMode: 'manager' },
    source: 'network',
  });

  assert.equal(snapshot.source, 'network');
  assert.deepEqual(clearDraftOptions, [undefined]);
  assert.deepEqual(dirtyStates, [false]);
  assert.equal(clearCalls, 1);
});

test('menu state loader boundary aligns stored drafts after workspace restaurant tools hydrate', async () => {
  const sandbox = loadAppSandbox();
  const callOrder = [];
  const clearDraftOptions = [];
  const dirtyStates = [];
  let clearCalls = 0;
  let refreshCalls = 0;
  const rawEnvelope = {
    baseSnapshot: { cats: [{ key: 'beer', items: [{ id: 'lager' }] }], featured_groups: [] },
    draftSnapshot: { cats: [{ key: 'beer', items: [{ id: 'lager' }] }], featured_groups: [] },
  };
  const alignedEnvelope = {
    baseSnapshot: { cats: [{ key: 'beer', items: [{ id: 'lager' }] }], featured_groups: [{ id: 'group-1' }] },
    draftSnapshot: { cats: [{ key: 'beer', items: [{ id: 'lager' }] }], featured_groups: [{ id: 'group-1' }] },
  };

  const service = sandbox.createMenuStateLoaderService({
    readState: async () => ({
      cats: [{ key: 'beer', items: [{ id: 'lager' }] }],
      meta: {},
      restaurant: { id: 'restaurant-main', name: 'Main Restaurant' },
      restaurantTools: {
        featuredGroups: [{ id: 'group-1', name: 'Featured', slots: [] }],
      },
      workspace: {
        actor: { id: 'user-1', role: 'manager' },
        permissions: { canManage: true },
      },
    }),
    hydrateFromState: () => {
      callOrder.push('hydrate');
    },
    applyWorkspaceRestaurantTools: () => {
      callOrder.push('tools');
      return true;
    },
    syncServerLiveSnapshot: () => {
      callOrder.push('snapshot');
    },
    readStoredLocalDraftEnvelope: () => rawEnvelope,
    alignLocalDraftEnvelope: envelope => {
      callOrder.push('align');
      assert.equal(envelope, rawEnvelope);
      return alignedEnvelope;
    },
    applyLocalDraftEnvelope: envelope => {
      callOrder.push('apply');
      assert.equal(envelope, alignedEnvelope);
      return true;
    },
    syncLocalDraftDirtyState: () => {
      callOrder.push('dirty');
      return false;
    },
    clearCurrentLocalDraft: options => {
      clearDraftOptions.push(options);
    },
    setDirty: value => {
      dirtyStates.push(value);
    },
    clearDraftChanges: () => {
      clearCalls += 1;
    },
    writeMenuCache: () => {},
    refreshFeatured: async () => {
      refreshCalls += 1;
    },
    buildSnapshot: source => ({ source }),
  });

  const snapshot = await service.load({
    request: { pageMode: 'manager' },
    source: 'network',
  });

  assert.equal(snapshot.source, 'network');
  assert.ok(callOrder.indexOf('tools') !== -1);
  assert.ok(callOrder.indexOf('snapshot') !== -1);
  assert.ok(callOrder.indexOf('tools') < callOrder.indexOf('align'));
  assert.ok(callOrder.indexOf('snapshot') < callOrder.indexOf('align'));
  assert.ok(callOrder.indexOf('align') < callOrder.indexOf('apply'));
  assert.deepEqual(clearDraftOptions, [undefined]);
  assert.deepEqual(dirtyStates, [false]);
  assert.equal(clearCalls, 1);
  assert.equal(refreshCalls, 0);
});

test('draft snapshot comparison no longer depends on top-level featured_groups', () => {
  const sandbox = loadAppSandbox();
  const left = {
    cats: [{ key: 'featured_specials', items: [{ id: 'special-1', name: 'Happy Hour Marg', featured_enabled: false }] }],
  };
  const right = {
    cats: [{ key: 'featured_specials', items: [{ id: 'special-1', name: 'Happy Hour Marg', featured_enabled: true }] }],
  };

  assert.equal(sandbox.areDraftDocumentsEqual(left, right), false);
});
