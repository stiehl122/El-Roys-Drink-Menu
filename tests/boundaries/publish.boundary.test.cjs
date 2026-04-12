const assert = require('node:assert/strict');
const test = require('node:test');

const { loadAppSandbox } = require('../helpers/runtime.cjs');

function createMenuSessionPorts(overrides = {}) {
  const diff = [
    {
      id: 'beer',
      icon: '🍺',
      label: 'Beers on Tap',
      added: ['New Lager'],
      removed: [],
      eightySixed: [],
      restored: [],
    },
  ];

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
    buildSnapshot: (source, request) => ({ source, request, dirty: true }),
    resolveMenu: async () => null,
    canLoadFromNetwork: () => true,
    restoreFallback: ({ request }) => ({ source: 'cache', usedFallback: true, snapshot: { source: 'cache', request } }),
    loadState: async ({ request, source = 'network' }) => ({ source, request }),
    pollState: async ({ request }) => ({ changed: false, designChanged: false, snapshot: { source: 'poll', request } }),
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
      diff,
      sections: diff.map(section => ({ ...section, changes: [] })),
      notificationChanges: [],
      saveOnlyChanges: [],
      patchMessage: 'Patch message',
      truncated: false,
      snapshot,
      mode: 'update-only',
    }),
    getMenuId: () => 'menu-main',
    getRestaurantId: () => 'restaurant-main',
    getMenuName: () => 'Main Menu',
    snapshotCurrentItemsAsLastSent: () => ({ beer: [] }),
    getCurrentFeaturedIds: () => ['feature-1'],
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

test('menu publish service boundary saves drafts and publishes updates', async () => {
  const sandbox = loadAppSandbox();
  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts());

  const draftResult = await lifecycle.saveDraft();
  assert.equal(draftResult.ok, true);
  assert.equal(draftResult.snapshot.source, 'draft-saved');

  const publishResult = await lifecycle.publishUpdate({ notify: false });
  assert.equal(publishResult.ok, true);
  assert.equal(publishResult.successMessage, '✅ Main Menu saved to the live menu.');
});
