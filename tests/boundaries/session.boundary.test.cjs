const assert = require('node:assert/strict');
const test = require('node:test');

const { getState, loadAppSandbox, setState } = require('../helpers/runtime.cjs');

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

test('menu state loader poll skips full state hydration when the public revision token is unchanged', async () => {
  const sandbox = loadAppSandbox();
  const request = {
    pageMode: 'public',
    requestedMenuId: 'menu-main',
    requestedMenuSlug: 'leroys-lounge-drinks',
  };
  let revisionReads = 0;
  let stateReads = 0;
  let hydrateCalls = 0;
  const cachedRevisionValues = [];

  const service = sandbox.createMenuStateLoaderService({
    readState: async () => {
      stateReads += 1;
      return {
        cats: [{ key: 'beer', items: [{ id: 'lager' }] }],
        meta: { publicRevision: 'sha256:unchanged' },
      };
    },
    readRevision: async ({ cachedRevision }) => {
      revisionReads += 1;
      cachedRevisionValues.push(cachedRevision);
      return { revision: 'sha256:unchanged' };
    },
    hydrateFromState: () => {
      hydrateCalls += 1;
    },
    clearCurrentLocalDraft: () => {},
    clearDraftChanges: () => {},
    writeMenuCache: () => {},
    refreshFeatured: async () => {},
    buildSnapshot: source => ({ source }),
    getCategorySnapshot: () => 'cats-before',
    getDesignSnapshot: () => 'design-before',
    getFeaturedSnapshot: () => 'featured-before',
  });

  await service.load({ request, source: 'network' });
  stateReads = 0;
  hydrateCalls = 0;

  const result = await service.poll({ request, useRevisionProbe: true });

  assert.equal(revisionReads, 1);
  assert.deepEqual(cachedRevisionValues, ['sha256:unchanged']);
  assert.equal(stateReads, 0);
  assert.equal(hydrateCalls, 0);
  assert.equal(result.changed, false);
  assert.equal(result.designChanged, false);
  assert.equal(result.skipped, 'unchanged-revision');
  assert.equal(result.snapshot.source, 'poll');
});

test('menu state loader poll performs a full read for changed revisions and caches the new token', async () => {
  const sandbox = loadAppSandbox();
  const request = {
    pageMode: 'public',
    requestedMenuId: 'menu-main',
    requestedMenuSlug: 'leroys-lounge-drinks',
  };
  let revisionReads = 0;
  let stateReads = 0;
  let hydrateCalls = 0;
  let phase = 'initial';
  let lastUpdatedTs = 10;
  let categorySnapshot = 'initial-cats';
  const cachedRevisionValues = [];
  const fullReadCacheModes = [];

  const service = sandbox.createMenuStateLoaderService({
    readState: async ({ options } = {}) => {
      stateReads += 1;
      fullReadCacheModes.push(options?.bypassCache === true);
      if (phase === 'initial') {
        return {
          cats: [{ key: 'beer', items: [{ id: 'lager' }] }],
          meta: { publicRevision: 'sha256:before' },
        };
      }
      return {
        cats: [{ key: 'beer', items: [{ id: 'pilsner' }] }],
        meta: { publicRevision: 'sha256:after' },
      };
    },
    readRevision: async ({ cachedRevision }) => {
      revisionReads += 1;
      cachedRevisionValues.push(cachedRevision);
      return { revision: 'sha256:after' };
    },
    hydrateFromState: () => {
      hydrateCalls += 1;
      if (phase === 'initial') {
        categorySnapshot = 'initial-cats';
      } else {
        categorySnapshot = 'updated-cats';
        lastUpdatedTs = 20;
      }
    },
    clearCurrentLocalDraft: () => {},
    clearDraftChanges: () => {},
    writeMenuCache: () => {},
    refreshFeatured: async () => {},
    buildSnapshot: source => ({ source }),
    getLastUpdatedTs: () => lastUpdatedTs,
    getCategorySnapshot: () => categorySnapshot,
    getDesignSnapshot: () => 'design',
    getFeaturedSnapshot: () => 'featured',
  });

  await service.load({ request, source: 'network' });
  phase = 'poll';
  stateReads = 0;
  hydrateCalls = 0;

  const changedResult = await service.poll({ request, useRevisionProbe: true });

  assert.equal(revisionReads, 1);
  assert.equal(stateReads, 1);
  assert.deepEqual(fullReadCacheModes.slice(-1), [true]);
  assert.equal(hydrateCalls, 1);
  assert.equal(changedResult.changed, true);

  stateReads = 0;
  hydrateCalls = 0;

  const skippedResult = await service.poll({ request, useRevisionProbe: true });

  assert.equal(revisionReads, 2);
  assert.deepEqual(cachedRevisionValues, ['sha256:before', 'sha256:after']);
  assert.equal(stateReads, 0);
  assert.equal(hydrateCalls, 0);
  assert.equal(skippedResult.skipped, 'unchanged-revision');
});

test('menu state loader poll does not cache a changed probe token when the full read lacks that revision', async () => {
  const sandbox = loadAppSandbox();
  const request = {
    pageMode: 'public',
    requestedMenuId: 'menu-main',
    requestedMenuSlug: 'leroys-lounge-drinks',
  };
  let revisionReads = 0;
  let stateReads = 0;
  let hydrateCalls = 0;
  let phase = 'initial';
  let categorySnapshot = 'initial-cats';

  const service = sandbox.createMenuStateLoaderService({
    readState: async () => {
      stateReads += 1;
      if (phase === 'initial') {
        return {
          cats: [{ key: 'beer', items: [{ id: 'lager' }] }],
          meta: { publicRevision: 'sha256:before' },
        };
      }
      return {
        cats: [{ key: 'beer', items: [{ id: 'lager' }] }],
        meta: {},
      };
    },
    readRevision: async () => {
      revisionReads += 1;
      return { revision: 'sha256:after' };
    },
    hydrateFromState: () => {
      hydrateCalls += 1;
      categorySnapshot = phase === 'initial' ? 'initial-cats' : `poll-cats-${hydrateCalls}`;
    },
    clearCurrentLocalDraft: () => {},
    clearDraftChanges: () => {},
    writeMenuCache: () => {},
    refreshFeatured: async () => {},
    buildSnapshot: source => ({ source }),
    getCategorySnapshot: () => categorySnapshot,
    getDesignSnapshot: () => 'design',
    getFeaturedSnapshot: () => 'featured',
  });

  await service.load({ request, source: 'network' });
  phase = 'poll';
  stateReads = 0;
  hydrateCalls = 0;

  const firstPoll = await service.poll({ request, useRevisionProbe: true });
  assert.equal(firstPoll.skipped, undefined);
  assert.equal(revisionReads, 1);
  assert.equal(stateReads, 1);
  assert.equal(hydrateCalls, 1);

  stateReads = 0;
  hydrateCalls = 0;

  const secondPoll = await service.poll({ request, useRevisionProbe: true });

  assert.equal(secondPoll.skipped, undefined);
  assert.equal(revisionReads, 2);
  assert.equal(stateReads, 1);
  assert.equal(hydrateCalls, 1);
});

test('menu state loader poll falls back to a full read when the revision probe fails', async () => {
  const sandbox = loadAppSandbox();
  const request = {
    pageMode: 'public',
    requestedMenuId: 'menu-main',
    requestedMenuSlug: 'leroys-lounge-drinks',
  };
  let stateReads = 0;
  let hydrateCalls = 0;

  const service = sandbox.createMenuStateLoaderService({
    readState: async () => {
      stateReads += 1;
      return {
        cats: [{ key: 'beer', items: [{ id: 'lager' }] }],
        meta: { publicRevision: 'sha256:fallback' },
      };
    },
    readRevision: async () => {
      throw new Error('revision unavailable');
    },
    hydrateFromState: () => {
      hydrateCalls += 1;
    },
    clearCurrentLocalDraft: () => {},
    clearDraftChanges: () => {},
    writeMenuCache: () => {},
    refreshFeatured: async () => {},
    buildSnapshot: source => ({ source }),
    getCategorySnapshot: () => 'cats',
    getDesignSnapshot: () => 'design',
    getFeaturedSnapshot: () => 'featured',
  });

  const result = await service.poll({ request, useRevisionProbe: true });

  assert.equal(stateReads, 1);
  assert.equal(hydrateCalls, 1);
  assert.equal(result.changed, false);
  assert.equal(result.designChanged, false);
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

test('hydrateState migrates legacy special categories and last sent baselines into featured_specials', () => {
  const sandbox = loadAppSandbox();

  setState(sandbox, {
    CATEGORY_DEFS: [],
    menuState: {},
  });

  getState(sandbox, `
    hydrateState({
      cats: [{
        id: 'cat-special',
        key: 'special',
        label: 'Monthly Specials',
        display_order: 2,
        items: [
          { id: 'legacy-special-1', name: 'Happy Hour Marg', on_menu: true, visibility: 'public' },
        ],
      }],
      meta: {
        last_sent_ts: 1712705100000,
        last_sent_state: {
          special: [
            { id: 'legacy-special-1', name: 'Happy Hour Marg', onMenu: true, visibility: 'public' },
          ],
        },
      },
      restaurant: null,
    })
  `);

  assert.deepEqual(
    getState(sandbox, 'JSON.parse(JSON.stringify(CATEGORY_DEFS.map(cat => cat.id)))'),
    ['featured_specials'],
  );
  assert.equal(getState(sandbox, 'menuState.featured_specials.items[0].featuredEnabled'), true);
  assert.equal(getState(sandbox, 'menuState.featured_specials.lastSent[0].featuredEnabled'), true);
});

test('applyPersistedDraftState restores legacy special drafts into featured_specials', () => {
  const sandbox = loadAppSandbox();

  setState(sandbox, {
    CATEGORY_DEFS: [{
      id: 'featured_specials',
      title: 'Featured Specials',
      label: 'Featured Specials',
      icon: '⭐',
      color: '',
      sub: '',
      placeholder: '',
      untappdEnabled: false,
    }],
    menuState: {
      featured_specials: {
        items: [],
        lastSent: [{
          id: 'legacy-special-1',
          name: 'Happy Hour Marg',
          onMenu: true,
          visibility: 'public',
          eightySixed: false,
          featuredEnabled: true,
        }],
      },
      _meta: {},
    },
  });

  assert.equal(getState(sandbox, `
    applyPersistedDraftState({
      context: { menuType: 'drinks' },
      cats: [{
        id: 'cat-special',
        key: 'special',
        label: 'Monthly Specials',
        display_order: 2,
        items: [
          { id: 'legacy-special-1', name: 'Happy Hour Marg', on_menu: true, visibility: 'public' },
        ],
      }],
      meta: {},
      restaurant: null,
      save_only_changes: [],
    })
  `), true);
  assert.deepEqual(
    getState(sandbox, 'JSON.parse(JSON.stringify(CATEGORY_DEFS.map(cat => cat.id)))'),
    ['featured_specials'],
  );
  assert.equal(getState(sandbox, 'menuState.featured_specials.items[0].featuredEnabled'), true);
  assert.equal(getState(sandbox, 'menuState.featured_specials.lastSent[0].featuredEnabled'), true);
});

test('public payload featuredItems still render through the shared featured section', () => {
  const sandbox = loadAppSandbox();
  const featuredEl = sandbox.document.getElementById('featured-public-section');
  setState(sandbox, {
    RESTAURANT_ID: 'restaurant-main',
    currentUser: null,
    menuState: {
      featured_specials: {
        items: [{
          id: 'special-1',
          name: 'Happy Hour Marg',
          desc: 'Citrus and salt.',
          price: '$10',
          on_menu: true,
          visibility: 'public',
          show_description: true,
          show_recipe: false,
          featured_enabled: true,
        }],
        lastSent: [],
      },
    },
  });

  const applied = sandbox.applyWorkspaceRestaurantTools({
    featuredItems: [{
      id: 'special-1',
      name: 'Happy Hour Marg',
      desc: 'Citrus and salt.',
      price: '$10',
      on_menu: true,
      visibility: 'public',
      show_description: true,
      show_recipe: false,
      featured_enabled: true,
    }],
  });

  assert.equal(applied, true);
  sandbox.renderFeaturedPublicSection();
  assert.equal(featuredEl.style.display, '');
  assert.match(featuredEl.innerHTML, /Specials/);
  assert.match(featuredEl.innerHTML, /Happy Hour Marg/);
});
