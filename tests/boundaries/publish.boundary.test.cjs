const assert = require('node:assert/strict');
const test = require('node:test');

const { createFetchResponse, getState, loadAppSandbox, loadSandboxWithScripts, setState } = require('../helpers/runtime.cjs');

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

test('menu session lifecycle prepares and commits through shared session modules without app-owned publish helpers', async () => {
  const sandbox = loadSandboxWithScripts([
    'core/session/publish-service.js',
    'core/session/menu-session.js',
  ]);
  const previewCalls = [];
  const commitCalls = [];

  sandbox.createMenuPublishFacade = () => {
    throw new Error('session lifecycle should not read app-owned publish facade helpers');
  };
  sandbox.createMenuPublishService = () => {
    throw new Error('session lifecycle should not read app-owned publish service helpers');
  };
  sandbox.__HF_SESSION_MODULES__.createMenuPublishService = (sessionPorts, runtime = {}) => ({
    async prepare(options = {}) {
      previewCalls.push({ sessionPorts: !!sessionPorts, options, runtime: !!runtime });
      return {
        ok: true,
        preview: { hasChanges: true, sections: [], notificationChanges: [], mode: 'save-and-send' },
        revisions: { liveRevision: 10, draftRevision: 11, notificationRevision: 9 },
      };
    },
    async publishUpdate(options = {}) {
      commitCalls.push({ sessionPorts: !!sessionPorts, options, runtime: !!runtime });
      return {
        ok: true,
        userOutcome: { successMessage: 'published', warningMessage: '', warnings: [] },
      };
    },
    async saveDraft(options = {}) {
      commitCalls.push({ sessionPorts: !!sessionPorts, options: { ...options, intent: 'save' }, runtime: !!runtime });
      return {
        ok: true,
        userOutcome: { successMessage: 'saved', warningMessage: '', warnings: [] },
      };
    },
  });

  const lifecycle = sandbox.__HF_SESSION_MODULES__.createMenuSessionLifecycle(createMenuSessionPorts(), {
    createPublishService: sandbox.__HF_SESSION_MODULES__.createMenuPublishService,
  });
  const preview = await lifecycle.preparePublish({ expectedLiveRevision: 10 });
  const commit = await lifecycle.publishUpdate({ selectedChangeIds: ['beer::added::lager'] });
  const save = await lifecycle.saveDraft({});

  assert.equal(preview.ok, true);
  assert.equal(commit.ok, true);
  assert.equal(save.ok, true);
  assert.equal(previewCalls.length, 1);
  assert.equal(commitCalls.length, 2);
});

test('menu publish service honors an explicit global facade override for direct consumers', async () => {
  const sandbox = loadSandboxWithScripts([
    'core/session/menu-publish-facade.js',
    'core/session/publish-service.js',
  ]);
  const calls = [];

  sandbox.createMenuPublishFacade = (sessionPorts, runtime = {}) => ({
    async prepare(options = {}) {
      calls.push({ type: 'prepare', sessionPorts: !!sessionPorts, runtime: !!runtime, options });
      return { ok: true, source: 'global-override' };
    },
    async commit(options = {}) {
      calls.push({ type: 'commit', sessionPorts: !!sessionPorts, runtime: !!runtime, options });
      return { ok: true, source: 'global-override', options };
    },
  });

  const service = sandbox.__HF_SESSION_MODULES__.createMenuPublishService(createMenuSessionPorts(), {});
  const preview = await service.prepare({ expectedLiveRevision: 10 });
  const save = await service.saveDraft({ pathname: '/manager' });

  assert.equal(preview.source, 'global-override');
  assert.equal(save.source, 'global-override');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, 'prepare');
  assert.equal(calls[1].type, 'commit');
  assert.equal(calls[1].options.intent, 'save');
});

test('menu publish service prepares through the server preview port when no facade is loaded', async () => {
  const sandbox = loadSandboxWithScripts(['core/session/publish-service.js']);
  const previewCalls = [];
  const service = sandbox.__HF_SESSION_MODULES__.createMenuPublishService(createMenuSessionPorts({
    async requestPublishPreview(options = {}) {
      previewCalls.push(options);
      return {
        ok: true,
        status: 200,
        payload: {
          ok: true,
          preview: {
            hasChanges: true,
            hasLocalDraft: true,
            sections: [{ id: 'beer', changes: [] }],
            notificationChanges: [{ id: 'beer::added::lager' }],
          },
          current_revisions: { live: 10 },
        },
      };
    },
  }), {});

  const result = await service.prepare({ expectedLiveRevision: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.current_revisions.live, 10);
  assert.equal(result.preview.sections[0].id, 'beer');
  assert.equal(previewCalls.length, 1);
  assert.equal(previewCalls[0].expectedLiveRevision, 10);
});

test('menu publish service keeps fallback methods explicit for quiet-save and publish paths', async () => {
  const sandbox = loadSandboxWithScripts(['core/session/publish-service.js']);
  const quietSaveCalls = [];
  const publishCalls = [];

  const saveOnlyService = sandbox.__HF_SESSION_MODULES__.createMenuPublishService(
    createMenuSessionPorts(),
    {},
    {
      fallback: () => ({
        async saveDraft(options = {}) {
          quietSaveCalls.push(options);
          return { ok: true, path: 'save-only' };
        },
      }),
    },
  );

  const saveResult = await saveOnlyService.saveDraft({ pathname: '/manager' });
  const publishUnavailable = await saveOnlyService.publishUpdate({ pathname: '/manager' });

  assert.equal(saveResult.path, 'save-only');
  assert.equal(quietSaveCalls.length, 1);
  assert.equal(publishUnavailable.ok, false);

  const publishOnlyService = sandbox.__HF_SESSION_MODULES__.createMenuPublishService(
    createMenuSessionPorts(),
    {},
    {
      fallback: () => ({
        async publishUpdate(options = {}) {
          publishCalls.push(options);
          return { ok: true, path: 'publish-only' };
        },
      }),
    },
  );

  const publishResult = await publishOnlyService.publishUpdate({ selectedChangeIds: ['beer::added::lager'] });
  const saveUnavailable = await publishOnlyService.saveDraft({});

  assert.equal(publishResult.path, 'publish-only');
  assert.equal(publishCalls.length, 1);
  assert.deepEqual(toPlainValue(publishCalls[0]), { selectedChangeIds: ['beer::added::lager'] });
  assert.equal(saveUnavailable.ok, false);
});

test('server-backed quiet save advances the local notification baseline', async () => {
  const sandbox = loadAppSandbox({
    fetch: async () => createFetchResponse(200, {
      ok: true,
      ts: 2000,
      preview: {
        hasChanges: true,
        hasLocalDraft: true,
        hasNotificationChanges: true,
        diff: [{ id: 'beer', changes: [] }],
        sections: [{ id: 'beer', changes: [] }],
        notificationChanges: [{ id: 'beer::added::lager' }],
      },
      notificationStatus: null,
    }),
  });
  setState(sandbox, {
    MENU_ID: 'menu-main',
    MENU_TYPE: 'drinks',
    RESTAURANT_ID: 'restaurant-main',
    _activeMenuName: 'Main Menu',
    currentUser: { uid: 'user-1', role: 'manager', accessToken: 'token', accessibleMenuIds: ['menu-main'] },
    CATEGORY_DEFS: [{ id: 'beer', title: 'Beer', icon: 'B' }],
    menuState: {
      beer: {
        items: [{ id: 'lager', name: 'New Lager', onMenu: true, visibility: 'public' }],
        lastSent: [],
      },
      _meta: {
        lastUpdatedTs: '1000',
        lastSentTs: '1000',
      },
    },
    updateSaveBtn: () => {},
    updateLastUpdatedLabel: () => {},
  });

  const result = await getState(sandbox, `getMenuSessionPorts().publishMenuUpdate({
    mode: 'save',
    preview: {
      hasChanges: true,
      hasLocalDraft: true,
      hasNotificationChanges: true,
      diff: [{ id: 'beer', changes: [] }],
      sections: [{ id: 'beer', changes: [] }],
      notificationChanges: [{ id: 'beer::added::lager' }]
    }
  })`);

  assert.equal(result.ok, true);
  assert.equal(getState(sandbox, 'menuState._meta.lastUpdatedTs'), '2000');
  assert.equal(getState(sandbox, 'menuState._meta.lastSentTs'), '2000');
});
