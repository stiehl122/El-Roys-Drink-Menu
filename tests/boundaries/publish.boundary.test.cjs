const assert = require('node:assert/strict');
const test = require('node:test');

const { loadAppSandbox } = require('../helpers/runtime.cjs');

function toPlainValue(value) {
  return JSON.parse(JSON.stringify(value));
}

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

test('menu publish facade prepares and commits through the workflow boundary', async () => {
  const sandbox = loadAppSandbox();
  const prepareCalls = [];
  const commitCalls = [];
  const prepareOptions = {
    pathname: '/elroyscantina',
    search: '?menu=el-roys',
    pageMode: 'manager',
    requestedMenuId: 'menu-preview',
    requestedMenuSlug: 'el-roys',
    expectedLiveRevision: 10,
    expectedDraftRevision: 11,
    expectedNotificationRevision: 9,
  };
  const commitOptions = {
    pathname: '/elroyscantina',
    search: '?menu=elroys-cantina-drinks',
    pageMode: 'manager',
    requestedMenuId: 'menu-commit',
    requestedMenuSlug: 'elroys-cantina-drinks',
    selectedChangeIds: ['beer::added::lager'],
    expectedLiveRevision: 10,
    expectedDraftRevision: 11,
    expectedNotificationRevision: 9,
  };

  sandbox.createMenuPublishWorkflow = ({ ports }) => ({
    async preview(command) {
      prepareCalls.push({ ports: !!ports, command });
      return {
        ok: true,
        preview: {
          hasChanges: true,
          hasLocalDraft: true,
          hasNotificationChanges: true,
          notificationChanges: [{ id: 'beer::added::lager' }],
          sections: [{ id: 'beer', changes: [] }],
          mode: 'save-and-send',
        },
        revisions: {
          liveRevision: 10,
          draftRevision: 11,
          notificationRevision: 9,
        },
      };
    },
    async execute(command) {
      commitCalls.push(command);
      return {
        ok: true,
        preview: {
          hasChanges: true,
          hasLocalDraft: true,
          hasNotificationChanges: true,
          notificationChanges: [{ id: 'beer::added::lager' }],
          sections: [{ id: 'beer', changes: [] }],
          mode: 'save-and-send',
        },
        userOutcome: {
          successMessage: 'published',
          warningMessage: '',
          warnings: [],
        },
        notification: {
          attempted: true,
          delivered: true,
          partial: false,
          summary: { okChannels: ['groupme'], skippedChannels: [], failedChannels: [] },
          retryable: false,
        },
        queue: {
          baselineAdvanced: true,
          selectedChangeIds: ['beer::added::lager'],
          clearedChangeIds: [],
          featuredSiblingMenusSynced: [],
        },
        livePersistence: { attempted: true, persisted: true },
      };
    },
  });

  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts());
  const preview = await lifecycle.preparePublish(prepareOptions);
  const result = await lifecycle.commitPublish(commitOptions);

  assert.equal(preview.ok, true);
  assert.equal(result.ok, true);
  assert.equal(prepareCalls.length, 1);
  assert.equal(commitCalls.length, 1);
  assert.equal(prepareCalls[0].ports, true);
  assert.deepEqual(toPlainValue(prepareCalls[0].command.request), {
    expectedLiveRevision: 10,
    expectedDraftRevision: 11,
    expectedNotificationRevision: 9,
  });
  assert.deepEqual(toPlainValue(prepareCalls[0].command.snapshot.request), {
    pathname: '/elroyscantina',
    search: '?menu=el-roys',
    pageMode: 'manager',
    actor: null,
    siteRestaurantId: 'restaurant-main',
    requestedMenuId: 'menu-preview',
    requestedMenuSlug: 'el-roys',
    expectedLiveRevision: 10,
    expectedDraftRevision: 11,
    expectedNotificationRevision: 9,
  });
  assert.deepEqual(toPlainValue(commitCalls[0].request), {
    selectedChangeIds: ['beer::added::lager'],
    expectedLiveRevision: 10,
    expectedDraftRevision: 11,
    expectedNotificationRevision: 9,
  });
  assert.deepEqual(toPlainValue(commitCalls[0].snapshot.request), {
    pathname: '/elroyscantina',
    search: '?menu=elroys-cantina-drinks',
    pageMode: 'manager',
    actor: null,
    siteRestaurantId: 'restaurant-main',
    requestedMenuId: 'menu-commit',
    requestedMenuSlug: 'elroys-cantina-drinks',
    selectedChangeIds: ['beer::added::lager'],
    expectedLiveRevision: 10,
    expectedDraftRevision: 11,
    expectedNotificationRevision: 9,
  });
});
