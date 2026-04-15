const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createElement,
  getState,
  loadAppSandbox,
  loadScript,
  setState,
} = require('./helpers/runtime.cjs');

function setupRouteDom(sandbox, prefix) {
  const doc = sandbox.document;
  const pageClass = prefix === 'll' ? '.ll-board-page' : '.erc-page';
  const templateId = prefix === 'll' ? 'leroy-route-template' : 'elroy-route-template';
  const menuNameId = prefix === 'll' ? 'll-route-menu-name' : null;
  const statusTsId = prefix === 'll' ? 'll-route-status-timestamp' : 'erc-route-status-timestamp';
  const footerTsId = prefix === 'll' ? 'll-route-footer-timestamp' : 'erc-route-footer-timestamp';
  const footerVersionId = prefix === 'll' ? 'll-route-footer-version' : 'erc-route-footer-version';
  const specialsId = prefix === 'll' ? 'll-route-specials' : 'erc-route-specials';
  const sectionsId = prefix === 'll' ? 'll-route-sections' : 'erc-route-sections';
  const settingsDropdownId = prefix === 'll' ? 'll-route-settings-dropdown' : 'erc-settings-dropdown';
  const swapDropdownId = prefix === 'll' ? 'll-route-swap-dropdown' : null;
  const swapTriggerId = prefix === 'll' ? 'll-route-swap-trigger' : null;

  const template = doc._registerElement(templateId, createElement('template', templateId));
  template.content = {
    cloneNode() {
      return createElement('fragment', `${prefix}-fragment`);
    },
  };

  const container = doc._registerElement('restaurant-site-wrapper', createElement('div', 'restaurant-site-wrapper'));
  const page = createElement('main', `${prefix}-page`);
  container.querySelector = selector => (selector === pageClass ? page : null);
  container.appendChild = child => child;

  const settingsWrapper = doc._registerSelector('[data-route-settings]', createElement('div', `${prefix}-settings-wrapper`));
  settingsWrapper.style.display = '';
  settingsWrapper.querySelectorAll = () => [];

  if (menuNameId) doc._registerElement(menuNameId, createElement('span', menuNameId));
  doc._registerElement(statusTsId, createElement('span', statusTsId));
  doc._registerElement(footerTsId, createElement('span', footerTsId));
  doc._registerElement(footerVersionId, createElement('span', footerVersionId));
  doc._registerElement(specialsId, createElement('div', specialsId));
  doc._registerElement(sectionsId, createElement('div', sectionsId));
  doc._registerElement(settingsDropdownId, createElement('div', settingsDropdownId));
  if (swapDropdownId) doc._registerElement(swapDropdownId, createElement('div', swapDropdownId));
  if (swapTriggerId) doc._registerElement(swapTriggerId, createElement('button', swapTriggerId));

  return { page, container, settingsWrapper };
}

function makeMenuState(itemsByCategory = {}, lastUpdatedTs = '1712705100000') {
  const state = { _meta: { lastUpdatedTs } };
  Object.entries(itemsByCategory).forEach(([categoryId, items]) => {
    state[categoryId] = { items, lastSent: [] };
  });
  return state;
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
    finalizePersistStatus() {},
    commitDraft() {},
    buildPreview: snapshot => ({
      hasChanges: true,
      hasLocalDraft: false,
      hasSharedDraft: false,
      hasNotificationChanges: true,
      hasSaveOnlyChanges: false,
      diff,
      sections: diff.map(section => ({
        ...section,
        changes: (section.added || []).map(name => ({
          id: `${section.id}::added::${name.toLowerCase()}`,
          kind: 'added',
          name,
          text: `+ ${name}`,
          sectionId: section.id,
          sectionLabel: section.label,
          icon: section.icon,
        })),
      })),
      notificationChanges: diff.flatMap(section => (section.added || []).map(name => ({
        id: `${section.id}::added::${name.toLowerCase()}`,
        kind: 'added',
        name,
        text: `+ ${name}`,
        sectionId: section.id,
        sectionLabel: section.label,
        icon: section.icon,
      }))),
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
    canEditRestaurantSpecials: () => true,
    getRestaurantMenuIds: () => ['menu-main', 'menu-sibling'],
    dispatchNotification: async () => ({
      ok: true,
      statusCode: 207,
      partial: true,
      summary: {
        anyOk: true,
        anyError: true,
        failedChannels: ['sms'],
        allSkipped: false,
      },
    }),
    collectNotificationWarnings: summary => {
      if (!summary?.anyError) return [];
      return ['Some notification channels failed: SMS.'];
    },
    syncLocalCache: () => false,
    logUpdate: async () => false,
    commitPublished() {},
    dedupeWarnings: warnings => Array.from(new Set(warnings.filter(Boolean))),
    ...overrides,
  };
}

test('menu session lifecycle handles redirect and fallback-aware open results', async () => {
  const sandbox = loadAppSandbox();
  const restored = [];
  let loadCalls = 0;

  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts({
    resolveMenu: async ({ request }) => {
      if (request.requestedMenuSlug === 'el-roys') {
        return { redirect: { href: '/elroyscantina?menu=el-roys-cantina-drinks' } };
      }
      return null;
    },
    canLoadFromNetwork: ({ request }) => request.requestedMenuSlug !== 'fallback-only',
    restoreFallback: ({ expectedRestaurantId, request }) => {
      restored.push({ expectedRestaurantId, request });
      return {
        source: 'cache',
        usedFallback: true,
        snapshot: { source: 'cache', request },
      };
    },
    loadState: async ({ request, source = 'network' }) => {
      loadCalls += 1;
      if (request.requestedMenuSlug === 'load-fails') throw new Error('boom');
      return { source, request };
    },
  }));

  const redirect = await lifecycle.open({ requestedMenuSlug: 'el-roys' });
  assert.equal(redirect.redirect.href, '/elroyscantina?menu=el-roys-cantina-drinks');

  const fallback = await lifecycle.open({
    requestedMenuSlug: 'fallback-only',
    expectedRestaurantId: 'restaurant-main',
  });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.usedFallback, true);
  assert.equal(fallback.showLoadError, false);
  assert.equal(fallback.snapshot.source, 'cache');
  assert.equal(restored[0].expectedRestaurantId, 'restaurant-main');

  const failed = await lifecycle.open({
    requestedMenuSlug: 'load-fails',
    expectedRestaurantId: 'restaurant-main',
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.showLoadError, true);
  assert.equal(failed.snapshot.source, 'cache');
  assert.equal(loadCalls, 1);
});

test('menu session lifecycle routes poll and manual refreshes through one boundary', async () => {
  const sandbox = loadAppSandbox();
  const calls = [];

  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts({
    loadState: async ({ request, source = 'network' }) => {
      calls.push(['load', request.requestedMenuSlug, source]);
      return { source, request };
    },
    pollState: async ({ request }) => {
      calls.push(['poll', request.requestedMenuSlug]);
      return {
        changed: true,
        designChanged: true,
        snapshot: { source: 'poll', request },
      };
    },
  }));

  const pollResult = await lifecycle.refresh({ reason: 'poll', requestedMenuSlug: 'leroys-lounge-drinks' });
  const manualResult = await lifecycle.refresh({ requestedMenuSlug: 'leroys-lounge-food', source: 'manual' });

  assert.equal(pollResult.changed, true);
  assert.equal(pollResult.designChanged, true);
  assert.equal(pollResult.snapshot.source, 'poll');
  assert.equal(manualResult.ok, true);
  assert.equal(manualResult.snapshot.source, 'manual');
  assert.deepEqual(calls, [
    ['poll', 'leroys-lounge-drinks'],
    ['load', 'leroys-lounge-food', 'manual'],
  ]);
});

test('menu session lifecycle saveDraft persists and patches last-updated metadata', async () => {
  const sandbox = loadAppSandbox();
  const patchDraftCalls = [];
  const commitCalls = [];

  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts({
    buildSnapshot: (source, request) => ({ source, request, dirty: true }),
    patchMenuDraftState: async (snapshot, ts) => {
      patchDraftCalls.push([snapshot, ts]);
      return { downgradedFields: [] };
    },
    commitDraft: ts => {
      commitCalls.push(ts);
    },
  }));

  const result = await lifecycle.saveDraft();

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.source, 'draft-saved');
  assert.equal(patchDraftCalls.length, 1);
  assert.ok(Array.isArray(patchDraftCalls[0][0].cats));
  assert.equal(patchDraftCalls[0][1], 1712705100000);
  assert.deepEqual(commitCalls, [1712705100000]);
});

test('menu publish service exposes draft-save and publish boundaries directly', async () => {
  const sandbox = loadAppSandbox();
  const patchDraftCalls = [];

  const ports = createMenuSessionPorts({
    buildSnapshot: source => ({ source, dirty: true }),
    patchMenuDraftState: async (_snapshot, ts) => {
      patchDraftCalls.push(ts);
      return { downgradedFields: [] };
    },
    syncLocalCache: () => true,
    logUpdate: async () => true,
    canEditRestaurantSpecials: () => false,
    getRestaurantMenuIds: () => [],
  });

  const service = sandbox.createMenuPublishService(ports, {
    buildSnapshot: source => ports.buildSnapshot(source),
    buildPreview: () => ports.buildPreview(ports.buildSnapshot('preview')),
  });

  const draftResult = await service.saveDraft();
  assert.equal(draftResult.ok, true);
  assert.equal(draftResult.snapshot.source, 'draft-saved');
  assert.deepEqual(patchDraftCalls, [1712705100000]);

  const publishResult = await service.publishUpdate({ notify: false });
  assert.equal(publishResult.ok, true);
  assert.equal(publishResult.notificationStatus, null);
  assert.equal(publishResult.warnings.length, 0);
});

test('menu session lifecycle publishes updates through one preview-aware boundary', async () => {
  const sandbox = loadAppSandbox();
  const patchCalls = [];

  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts({
    patchMenuMeta: async update => {
      patchCalls.push(['primary', update]);
      return { downgradedFields: ['last_sent_featured'] };
    },
    patchMenuMetaForMenu: async (menuId, update) => {
      patchCalls.push([menuId, update]);
      return { downgradedFields: [] };
    },
    syncLocalCache: () => false,
    logUpdate: async () => false,
  }));

  const preview = lifecycle.preview();
  const result = await lifecycle.publishUpdate({ preview });

  assert.equal(result.ok, true);
  assert.equal(result.notificationStatus.statusCode, 207);
  assert.equal(result.preview, preview);
  assert.equal(patchCalls.length, 0);
  assert.ok(result.warnings.some(message => message.includes('Some notification channels failed: SMS.')));
  assert.ok(result.warnings.some(message => message.includes('remain ready to send again')));
});

test('menu session lifecycle can publish without firing notifications', async () => {
  const sandbox = loadAppSandbox();
  let notificationCalls = 0;

  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts({
    canEditRestaurantSpecials: () => false,
    getRestaurantMenuIds: () => [],
    dispatchNotification: async () => {
      notificationCalls += 1;
      return { ok: true, statusCode: 200, summary: { anyOk: true, anyError: false, failedChannels: [], allSkipped: false } };
    },
    syncLocalCache: () => true,
    logUpdate: async () => true,
  }));

  const result = await lifecycle.publishUpdate({ notify: false });

  assert.equal(result.ok, true);
  assert.equal(result.notificationStatus, null);
  assert.equal(notificationCalls, 0);
  assert.equal(result.warnings.length, 0);
  assert.match(result.successMessage, /saved to the live menu/i);
});

test('notification delivery service normalizes API channel results', async () => {
  const sandbox = loadAppSandbox();
  const requests = [];
  const service = sandbox.createNotificationDeliveryService({
    fetchImpl: async (url, options = {}) => {
      requests.push([url, options]);
      return {
        status: 207,
        async json() {
          return {
            results: {
              groupme: 'ok',
              sms: 'error:500',
              discord: 'skipped',
            },
          };
        },
      };
    },
  });

  const result = await service.sendMenuUpdate({
    menuId: 'menu-main',
    patchMessage: 'Patch message',
    accessToken: 'token-1',
  });

  assert.equal(result.ok, true);
  assert.equal(result.partial, true);
  assert.equal(result.statusCode, 207);
  assert.deepEqual(Array.from(result.summary.okChannels || []), ['groupme']);
  assert.deepEqual(Array.from(result.summary.failedChannels || []), ['sms']);
  assert.deepEqual(Array.from(result.summary.skippedChannels || []), ['discord']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], '/api/manager');
  assert.equal(JSON.parse(requests[0][1].body).action, 'send_notification');
  assert.equal(requests[0][1].headers.Authorization, 'Bearer token-1');
});

test('draft ledger service provides action-bar and item badge state through one boundary', () => {
  const sandbox = loadAppSandbox();
  const service = sandbox.createDraftLedgerService({
    isDirty: () => true,
    hasSharedDraft: () => false,
    getDraftChangeCount: () => 2,
    getDiffLinesCount: () => 0,
    getDiffSections: () => [{
      id: 'beer',
      added: ['Lager'],
      eightySixed: [],
      restored: [],
    }],
    getSaveOnlyChanges: () => [{ key: 'beer::item-1', itemId: 'item-1' }],
  });

  const actionBarState = service.getActionBarState({ isCompactViewport: false });
  assert.equal(actionBarState.hasDraftChanges, true);
  assert.equal(actionBarState.hasPendingUpdate, false);
  assert.equal(actionBarState.publishLabel, 'Save');
  assert.equal(actionBarState.summaryText, '2 pending changes. Save Draft updates the shared draft. Save opens Patch Notes Preview to publish live.');

  const draftBadge = service.getItemBadge({
    item: { id: 'item-1', name: 'Lager', eightySixed: false },
    catId: 'beer',
    lastSentNames: new Set(),
  });
  assert.equal(draftBadge.text, 'DRAFT');
  assert.equal(draftBadge.className, 'item-state-badge--draft');

  const unsentService = sandbox.createDraftLedgerService({
    isDirty: () => false,
    hasSharedDraft: () => false,
    getDraftChangeCount: () => 0,
    getDiffLinesCount: () => 1,
    getDiffSections: () => [{
      id: 'beer',
      added: ['Lager'],
      eightySixed: [],
      restored: [],
    }],
    getSaveOnlyChanges: () => [],
  });
  const unsentBadge = unsentService.getItemBadge({
    item: { id: 'item-1', name: 'Lager', eightySixed: false },
    catId: 'beer',
    lastSentNames: new Set(['lager']),
  });
  assert.equal(unsentBadge.text, 'UNSENT');
  assert.equal(unsentBadge.className, 'item-state-badge--unsent');
});

test('manager action bar stays visible and reflects idle and active draft states', () => {
  const sandbox = loadAppSandbox();
  const bar = sandbox.document._registerElement('manager-action-bar', createElement('div', 'manager-action-bar'));
  const primaryGroup = sandbox.document._registerElement('manager-primary-action-group', createElement('div', 'manager-primary-action-group'));
  const summary = sandbox.document._registerElement('manager-action-bar-summary', createElement('div', 'manager-action-bar-summary'));
  sandbox.document._registerElement('sync-status', createElement('div', 'sync-status'));
  const saveBtn = sandbox.document._registerElement('save-btn', createElement('button', 'save-btn'));
  const sendBtn = sandbox.document._registerElement('send-btn', createElement('button', 'send-btn'));

  sandbox.innerWidth = 960;
  sandbox.window.innerWidth = 960;

  setState(sandbox, {
    _dirty: false,
    _diffDirty: false,
    _diffCache: [],
  });

  sandbox.updateManagerActionBar();

  assert.equal(bar.hidden, false);
  assert.equal(primaryGroup.hidden, false);
  assert.equal(summary.textContent, 'No Pending Changes');
  assert.equal(saveBtn.disabled, true);
  assert.equal(saveBtn.textContent, 'Save Draft');
  assert.equal(sendBtn.disabled, true);
  assert.equal(bar.classList.contains('is-idle'), true);

  setState(sandbox, {
    _dirty: true,
    _diffDirty: false,
    _diffCache: [
      {
        id: 'beer',
        icon: '🍺',
        label: 'Beers on Tap',
        added: ['New Lager'],
        removed: ['Old Lager'],
        eightySixed: [],
        restored: [],
      },
    ],
  });

  sandbox.updateManagerActionBar();

  assert.equal(summary.textContent, '2 pending changes. Save Draft updates the shared draft. Save opens Patch Notes Preview to publish live.');
  assert.equal(saveBtn.disabled, false);
  assert.equal(saveBtn.textContent, 'Save Draft');
  assert.equal(sendBtn.disabled, false);
  assert.equal(bar.classList.contains('is-idle'), false);

  setState(sandbox, {
    _dirty: false,
    _hasSharedDraft: true,
    _diffDirty: false,
    _diffCache: [
      {
        id: 'beer',
        icon: '🍺',
        label: 'Beers on Tap',
        added: ['New Lager'],
        removed: [],
        eightySixed: [],
        restored: [],
      },
    ],
  });

  sandbox.updateManagerActionBar();

  assert.equal(summary.textContent, '1 saved draft change is ready to publish.');
  assert.equal(saveBtn.disabled, true);
  assert.equal(saveBtn.textContent, 'Save Draft');
  assert.equal(sendBtn.disabled, false);
  assert.equal(sendBtn.textContent, 'Save');

  setState(sandbox, {
    _dirty: false,
    _hasSharedDraft: true,
    _diffDirty: false,
    _diffCache: [],
  });

  sandbox.updateManagerActionBar();

  assert.equal(summary.textContent, 'Saved draft matches the live menu. Clear Draft removes it.');
  assert.equal(saveBtn.disabled, false);
  assert.equal(saveBtn.textContent, 'Clear Draft');
  assert.equal(sendBtn.disabled, true);
  assert.equal(sendBtn.textContent, 'Save');
});

test('save-only menu edits stay in the draft session until save', async () => {
  const sandbox = loadAppSandbox();
  const persistCalls = [];

  setState(sandbox, {
    menuState: {
      beer: {
        items: [
          {
            id: 'item-1',
            name: 'Lager',
            price: '$8',
            desc: '',
            recipe: [],
            onMenu: true,
          },
        ],
        lastSent: [],
      },
    },
    persistState: async options => {
      persistCalls.push(options);
      return true;
    },
  });

  await sandbox.savePrice('beer', 'item-1', '$9');

  assert.equal(persistCalls.length, 0);
  assert.equal(getState(sandbox, '_dirty'), true);
  assert.equal(getState(sandbox, 'getDraftSaveOnlyChanges().length'), 1);
});

test('save draft persists a shared draft snapshot without publishing the live menu', async () => {
  const sandbox = loadAppSandbox();
  const requests = [];

  setState(sandbox, {
    MENU_ID: 'menu-main',
    currentUser: { accessToken: 'token-1', uid: 'user-1' },
    _dirty: true,
    menuState: {
      beer: {
        items: [
          {
            id: 'item-1',
            name: 'Lager',
            desc: '',
            recipe: [],
            price: '$9',
            eightySixed: false,
            onMenu: true,
            visibility: 'public',
            upcharges: [],
            showDescription: true,
            showRecipe: false,
          },
        ],
        lastSent: [],
      },
      _meta: {},
    },
  });
  sandbox.fetch = async (url, options = {}) => {
    requests.push([url, JSON.parse(options.body || '{}')]);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, ts: 1712705100000, downgradedFields: [] }),
    };
  };

  const result = await sandbox.ensureCurrentMenuSession().saveDraft();

  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], '/api/manager');
  assert.equal(requests[0][1].action, 'save_draft');
  assert.ok(Array.isArray(requests[0][1].snapshot.cats));
  assert.equal(getState(sandbox, '_dirty'), false);
  assert.equal(getState(sandbox, 'hasSharedDraftState()'), true);
  assert.equal(getState(sandbox, "buildMenuSessionSnapshot('test').status"), 'DRAFTED');
});

test('save draft clears a shared draft that already matches live', async () => {
  const sandbox = loadAppSandbox();
  const requests = [];

  setState(sandbox, {
    MENU_ID: 'menu-main',
    currentUser: { accessToken: 'token-1', uid: 'user-1' },
    _dirty: false,
    _hasSharedDraft: true,
    _diffDirty: false,
    _diffCache: [],
    menuState: {
      beer: {
        items: [
          {
            id: 'item-1',
            name: 'Lager',
            desc: '',
            recipe: [],
            price: '$8',
            eightySixed: false,
            onMenu: true,
            visibility: 'public',
            upcharges: [],
            showDescription: true,
            showRecipe: false,
          },
        ],
        lastSent: [
          {
            id: 'item-1',
            name: 'Lager',
            desc: '',
            recipe: [],
            price: '$8',
            eightySixed: false,
            onMenu: true,
            visibility: 'public',
            upcharges: [],
            showDescription: true,
            showRecipe: false,
          },
        ],
      },
      _meta: {},
    },
  });
  sandbox.fetch = async (url, options = {}) => {
    requests.push([url, JSON.parse(options.body || '{}')]);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        status: 'draft_cleared',
        sharedDraft: { exists: false, savedAt: null, savedBy: null, source: '' },
      }),
    };
  };

  const result = await sandbox.ensureCurrentMenuSession().saveDraft();

  assert.equal(result.ok, true);
  assert.equal(result.cleared, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], '/api/manager');
  assert.equal(requests[0][1].action, 'save_draft');
  assert.deepEqual(requests[0][1].snapshot, {});
  assert.equal(getState(sandbox, 'hasSharedDraftState()'), false);
  assert.equal(getState(sandbox, "buildMenuSessionSnapshot('test').status"), 'LIVE');
});

test('save menu publishes a shared draft to live and leaves unsent changes behind', async () => {
  const sandbox = loadAppSandbox();
  const requests = [];

  setState(sandbox, {
    MENU_ID: 'menu-main',
    _activeMenuName: 'Main Menu',
    _dirty: false,
    _hasSharedDraft: true,
    _diffDirty: false,
    _diffCache: [
      {
        id: 'beer',
        icon: '🍺',
        label: 'Beers on Tap',
        added: ['Draft Lager'],
        removed: [],
        eightySixed: [],
        restored: [],
      },
    ],
    currentUser: { accessToken: 'token-1', uid: 'user-1' },
  });
  sandbox.fetch = async (url, options = {}) => {
    requests.push([url, JSON.parse(options.body || '{}')]);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, ts: 1712705100000, successMessage: 'Saved to the live menu.' }),
    };
  };

  const session = sandbox.ensureCurrentMenuSession();
  const result = await session.publishUpdate({ preview: session.preview(), notify: false });

  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], '/api/manager');
  assert.equal(requests[0][1].action, 'publish');
  assert.equal(requests[0][1].mode, 'save');
  assert.ok(Array.isArray(requests[0][1].selected_change_ids));
  assert.equal(Object.prototype.hasOwnProperty.call(requests[0][1], 'preview_diff'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(requests[0][1], 'selected_sections'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(requests[0][1], 'patch_message'), false);
  assert.equal(getState(sandbox, '_hasSharedDraft'), false);
  assert.equal(getState(sandbox, "buildMenuSessionSnapshot('after-save').status"), 'LIVE | UNSENT');
  assert.match(result.successMessage, /saved to the live menu/i);
});

test('manager item badges mark live unsent changes distinctly from drafts', () => {
  const sandbox = loadAppSandbox();

  setState(sandbox, {
    _dirty: false,
    _hasSharedDraft: false,
    _diffDirty: false,
    _diffCache: [
      {
        id: 'beer',
        icon: '🍺',
        label: 'Beers on Tap',
        added: ['Lager'],
        removed: [],
        eightySixed: [],
        restored: [],
      },
    ],
  });

  const badge = sandbox.getItemStateBadge({ id: 'item-1', name: 'Lager', eightySixed: false }, 'beer', new Set());
  assert.equal(badge.text, 'UNSENT');
  assert.equal(badge.className, 'item-state-badge--unsent');
});

test('access session service restores sessions and resolves settings access', async () => {
  const sandbox = loadAppSandbox();
  const refreshCalls = [];
  const roleCalls = [];
  const sessionChanges = [];

  setState(sandbox, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    applyRole: role => roleCalls.push(role),
    _scheduleTokenRefresh: expiresAt => refreshCalls.push(expiresAt),
    sbGetProfile: async token => {
      sessionChanges.push(['profile', token]);
      return {
        role: 'manager',
        name: 'Taylor',
        accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'],
      };
    },
    sbRefreshToken: async refreshToken => {
      sessionChanges.push(['refresh', refreshToken]);
      return {
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        user: { id: 'user-1', email: 'taylor@example.com' },
      };
    },
  });
  sandbox.localStorage.setItem('hf_sb_access_token', 'stored-token');
  sandbox.localStorage.setItem('hf_sb_refresh_token', 'stored-refresh');
  sandbox.localStorage.setItem('hf_sb_expires_at', String(Date.now() + 60 * 60 * 1000));
  sandbox.localStorage.setItem('hf_sb_uid', 'user-1');
  sandbox.localStorage.setItem('hf_sb_email', 'taylor@example.com');

  const service = sandbox.getAccessSessionService();
  const restored = await service.restoreStoredSession();

  assert.equal(restored.restored, true);
  assert.equal(restored.source, 'stored-access');
  assert.equal(getState(sandbox, 'currentUser').name, 'Taylor');
  assert.equal(getState(sandbox, 'currentUser').role, 'manager');
  assert.equal(refreshCalls.length, 1);
  assert.equal(roleCalls[0], 'manager');
  assert.equal(sessionChanges[0][0], 'profile');

  sandbox.location.hash = '#type=recovery&access_token=recovery-token&refresh_token=recovery-refresh&expires_in=3600';
  const recovered = await service.handleRecoveryCallback();
  assert.equal(recovered.handled, true);
  assert.equal(getState(sandbox, '_recoverySessionData').access_token, 'recovery-token');

  sandbox.location.hash = '';
  setState(sandbox, { _appPageMode: 'manager' });
  sandbox.location.search = '?menu=el-roys-cantina-drinks';
  setState(sandbox, { currentUser: {
    role: 'manager',
    accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'],
  } });

  const decision = sandbox.resolveRequestedSettingsRoute(sandbox.currentUser);
  assert.equal(decision.kind, 'manager-redirect');
  assert.equal(decision.targetPath, '/manager?menu=leroys-lounge-drinks');

  setState(sandbox, { _appPageMode: 'admin' });
  const adminDecision = sandbox.resolveRequestedSettingsRoute(sandbox.currentUser);
  assert.equal(adminDecision.kind, 'admin-denied');
});

test('settings auth gate routes unauthenticated users through requestSignIn boundary', async () => {
  const sandbox = loadAppSandbox({
    location: {
      origin: 'https://example.com',
      protocol: 'https:',
      hostname: 'example.com',
      pathname: '/manager',
      search: '',
      hash: '',
      assign() {},
    },
  });
  const signInRequests = [];

  setState(sandbox, {
    currentUser: null,
    _appPageMode: 'manager',
    requestSignIn: options => { signInRequests.push(options || {}); },
  });

  const service = sandbox.getAccessSessionService();
  const result = await service.syncRequestedPageMode();

  assert.equal(result.handled, true);
  assert.equal(result.status, 'auth-required');
  assert.equal(signInRequests.length, 1);
  assert.equal(signInRequests[0].screen, 'signin');
});

test('settings route policy service centralizes manager and admin access decisions', () => {
  const sandbox = loadAppSandbox();
  const service = sandbox.createSettingsRoutePolicyService({
    getPageMode: () => 'manager',
    getMenuId: () => 'menu-main',
    getKnownMenuOrder: () => ['menu-main', 'menu-other'],
    getRequestedMenu: () => ({ id: 'menu-other' }),
    canManageMenu: (menuId, user) => (user?.accessibleMenuIds || []).includes(menuId),
    getFallbackMenuId: user => (user?.accessibleMenuIds || [])[0] || '',
    getManagerHrefForMenuId: menuId => `/manager?menu=${menuId}`,
    getPublicHrefForMenuId: menuId => `/public?menu=${menuId}`,
  });

  const redirectDecision = service.decide({
    role: 'manager',
    accessibleMenuIds: ['menu-main'],
  });
  assert.equal(redirectDecision.kind, 'manager-redirect');
  assert.equal(redirectDecision.menuId, 'menu-main');
  assert.equal(redirectDecision.targetPath, '/manager?menu=menu-main');

  const deniedDecision = service.decide({
    role: 'manager',
    accessibleMenuIds: [],
  });
  assert.equal(deniedDecision.kind, 'manager-denied');
  assert.equal(deniedDecision.targetPath, '/public?menu=menu-other');

  const adminDenied = sandbox.createSettingsRoutePolicyService({
    getPageMode: () => 'admin',
    getMenuId: () => 'menu-main',
    getKnownMenuOrder: () => ['menu-main'],
    getRequestedMenu: () => null,
    canManageMenu: () => false,
    getFallbackMenuId: () => '',
    getManagerHrefForMenuId: () => '',
    getPublicHrefForMenuId: () => '',
  }).decide({ role: 'manager' });
  assert.equal(adminDenied.kind, 'admin-denied');
});

test('public href generation uses bare restaurant routes for food and ?menu=drinks for drinks', () => {
  const sandbox = loadAppSandbox();

  assert.equal(
    sandbox.getPublicHrefForMenuId('00000000-0000-0000-0000-000000000021'),
    '/leroyslounge'
  );
  assert.equal(
    sandbox.getPublicHrefForMenuId('00000000-0000-0000-0000-000000000020'),
    '/leroyslounge?menu=drinks'
  );
  assert.equal(
    sandbox.getPublicHrefForMenuId('00000000-0000-0000-0000-000000000003'),
    '/elroyscantina'
  );
  assert.equal(
    sandbox.getPublicHrefForMenuId('00000000-0000-0000-0000-000000000002'),
    '/elroyscantina?menu=drinks'
  );
});

test('sbResolveMenu defaults bare restaurant routes to that restaurant food menu', async () => {
  const sandbox = loadAppSandbox();
  const menus = getState(sandbox, 'MENUS');
  const restaurants = getState(sandbox, 'RESTAURANTS');
  const replaceCalls = [];
  const assigned = [];

  sandbox.location.pathname = '/elroyscantina';
  sandbox.location.search = '';
  sandbox.location.href = 'https://example.com/elroyscantina';
  sandbox.location.assign = url => assigned.push(url);
  sandbox.history.replaceState = (_, __, url) => replaceCalls.push(url);
  sandbox.fetch = async url => {
    if (String(url) === '/api/public?action=menu_index') {
      return {
        ok: true,
        text: async () => JSON.stringify({
          menus: [
            { ...menus.LEROYS_DRINKS, restaurant_id: menus.LEROYS_DRINKS.restaurantId, archived: false },
            { ...menus.LEROYS_FOOD, restaurant_id: menus.LEROYS_FOOD.restaurantId, archived: false },
            { ...menus.ELROYS_DRINKS, restaurant_id: menus.ELROYS_DRINKS.restaurantId, archived: false },
            { ...menus.ELROYS_FOOD, restaurant_id: menus.ELROYS_FOOD.restaurantId, archived: false },
          ],
          restaurants: [restaurants.LEROYS, restaurants.ELROYS],
        }),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  sandbox.window.fetch = sandbox.fetch;

  setState(sandbox, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    _siteRestaurant: restaurants.ELROYS,
    MENU_ID: '',
    RESTAURANT_ID: '',
    MENU_TYPE: 'drinks',
  });

  await sandbox.sbResolveMenu();

  assert.equal(getState(sandbox, 'MENU_ID'), menus.ELROYS_FOOD.id);
  assert.equal(getState(sandbox, 'RESTAURANT_ID'), restaurants.ELROYS.id);
  assert.equal(getState(sandbox, 'MENU_TYPE'), 'food');
  assert.deepEqual(assigned, []);
  assert.equal(replaceCalls.at(-1), 'https://example.com/elroyscantina');
});

test('sbResolveMenu treats ?menu=drinks as restaurant-relative public state', async () => {
  const sandbox = loadAppSandbox();
  const menus = getState(sandbox, 'MENUS');
  const restaurants = getState(sandbox, 'RESTAURANTS');
  const replaceCalls = [];

  sandbox.location.pathname = '/elroyscantina';
  sandbox.location.search = '?menu=drinks';
  sandbox.location.href = 'https://example.com/elroyscantina?menu=drinks';
  sandbox.history.replaceState = (_, __, url) => replaceCalls.push(url);
  sandbox.fetch = async url => {
    const text = String(url);
    if (text === '/api/public?action=menu_index') {
      return {
        ok: true,
        text: async () => JSON.stringify({
          menus: [
            { ...menus.LEROYS_DRINKS, restaurant_id: menus.LEROYS_DRINKS.restaurantId, archived: false },
            { ...menus.LEROYS_FOOD, restaurant_id: menus.LEROYS_FOOD.restaurantId, archived: false },
            { ...menus.ELROYS_DRINKS, restaurant_id: menus.ELROYS_DRINKS.restaurantId, archived: false },
            { ...menus.ELROYS_FOOD, restaurant_id: menus.ELROYS_FOOD.restaurantId, archived: false },
          ],
          restaurants: [restaurants.LEROYS, restaurants.ELROYS],
        }),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  sandbox.window.fetch = sandbox.fetch;

  setState(sandbox, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    _siteRestaurant: restaurants.ELROYS,
    MENU_ID: '',
    RESTAURANT_ID: '',
    MENU_TYPE: 'food',
  });

  await sandbox.sbResolveMenu();

  assert.equal(getState(sandbox, 'MENU_ID'), menus.ELROYS_DRINKS.id);
  assert.equal(getState(sandbox, 'RESTAURANT_ID'), restaurants.ELROYS.id);
  assert.equal(getState(sandbox, 'MENU_TYPE'), 'drinks');
  assert.deepEqual(replaceCalls, []);
});

test('selectMenu uses replaceState with the canonical public menu url', () => {
  const sandbox = loadAppSandbox();
  const menus = getState(sandbox, 'MENUS');
  const replaceCalls = [];
  let pushCalls = 0;

  sandbox.location.pathname = '/elroyscantina';
  sandbox.location.search = '';
  sandbox.location.href = 'https://example.com/elroyscantina';
  sandbox.history.replaceState = (_, __, url) => replaceCalls.push(url);
  sandbox.history.pushState = () => {
    pushCalls += 1;
  };

  setState(sandbox, {
    _appPageMode: 'public',
    closeMenuPicker: () => {},
    updateActiveMenuBar: () => {},
    renderUserHeader: () => {},
    ensureCurrentMenuSession: () => {},
  });

  sandbox.selectMenu(
    menus.ELROYS_DRINKS.id,
    menus.ELROYS_DRINKS.slug,
    menus.ELROYS_DRINKS.name,
    menus.ELROYS_DRINKS.type,
    menus.ELROYS_DRINKS.restaurantId
  );

  assert.equal(replaceCalls.at(-1), '/elroyscantina?menu=drinks');
  assert.equal(pushCalls, 0);
});

test('menu state loader service applies fallback and featured refresh through one boundary', async () => {
  const sandbox = loadAppSandbox();
  let fallbackCalls = 0;
  let clearCalls = 0;
  let featuredCalls = 0;

  const service = sandbox.createMenuStateLoaderService({
    readState: async () => {
      throw new Error('network failed');
    },
    hydrateFromState: () => {},
    applyPersistedDraftState: () => false,
    setDefaultState: () => {
      fallbackCalls += 1;
    },
    clearDraftChanges: () => {
      clearCalls += 1;
    },
    writeMenuCache: () => {},
    refreshFeatured: async () => {
      featuredCalls += 1;
    },
    buildSnapshot: source => ({ source }),
  });

  const snapshot = await service.load({
    fallbackToDefault: true,
    includeFeatured: true,
    persistCache: true,
    request: { pageMode: 'public' },
    source: 'network',
  });

  assert.equal(snapshot.source, 'network');
  assert.equal(fallbackCalls, 1);
  assert.equal(clearCalls, 1);
  assert.equal(featuredCalls, 1);
});

test('public route contract exposes a stable snapshot and switchMenu action', async () => {
  const sandbox = loadAppSandbox();
  const selectedMenus = [];
  let loadCalls = 0;
  let renderCalls = 0;
  let applyCalls = 0;

  setState(sandbox, {
    RESTAURANT_ID: '00000000-0000-0000-0000-000000000010',
    MENU_ID: '00000000-0000-0000-0000-000000000020',
    MENU_TYPE: 'drinks',
    _activeMenuName: "Leroy's Lounge Drinks",
    _activeRestaurantName: "Leroy's Lounge",
    _siteRestaurant: { id: '00000000-0000-0000-0000-000000000010', name: "Leroy's Lounge" },
    currentUser: { role: 'manager', name: 'Alex', accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'] },
    menuState: makeMenuState({
      beer: [{ id: 'beer-1', name: 'Draft Lager', onMenu: true, visibility: 'public' }],
    }),
    _featuredGroups: [],
    currentUserCanEditRestaurantSpecials: () => true,
    getManagedCategoryDefs: () => [{ id: 'beer', title: 'Beers on Tap', icon: '🍺' }],
    getLastUpdatedTs: () => '1712705100000',
    selectMenu: (...args) => {
      selectedMenus.push(args);
    },
    getPublicHrefForCurrentMenu: () => '/leroyslounge?menu=leroys-lounge-drinks',
    loadActiveMenuState: async () => {
      loadCalls += 1;
    },
    renderPublicViews: async () => {
      renderCalls += 1;
    },
    applyDesign: () => {
      applyCalls += 1;
    },
  });
  sandbox.location.pathname = '/leroyslounge';
  sandbox.location.search = '?menu=leroys-lounge-drinks';

  const contract = sandbox.createPublicRouteContract();
  assert.equal(contract.snapshot.activeMenuName, "Leroy's Lounge Drinks");
  assert.equal(contract.snapshot.restaurantId, getState(sandbox, 'RESTAURANT_ID'));
  assert.equal(contract.snapshot.menuId, getState(sandbox, 'MENU_ID'));
  assert.equal(contract.snapshot.publicFooter.signIn, null);
  assert.equal(contract.snapshot.publicFooter.links.map(link => link.label).join(','), 'Manager,Sign Out');
  assert.equal(typeof contract.actions.switchMenu, 'function');
  assert.equal(typeof contract.actions.openAuthOverlay, 'function');
  assert.equal(typeof contract.actions.signOut, 'function');

  await contract.actions.switchMenu({
    id: getState(sandbox, 'MENU_ID'),
    slug: 'leroys-lounge-drinks',
    name: "Leroy's Lounge Drinks",
    type: 'drinks',
    restaurantId: getState(sandbox, 'RESTAURANT_ID'),
  });

  assert.equal(selectedMenus.length, 1);
  assert.equal(loadCalls, 1);
  assert.equal(renderCalls, 1);
  assert.equal(applyCalls, 1);
});

test('public route adapter converts legacy snapshot input into a contract boundary', async () => {
  const sandbox = loadAppSandbox();
  const selectedMenus = [];
  let loadCalls = 0;
  let renderCalls = 0;
  let applyCalls = 0;

  setState(sandbox, {
    RESTAURANT_ID: '00000000-0000-0000-0000-000000000010',
    MENU_ID: '00000000-0000-0000-0000-000000000020',
    MENU_TYPE: 'drinks',
    _activeMenuName: "Leroy's Lounge Drinks",
    _activeRestaurantName: "Leroy's Lounge",
    _siteRestaurant: { id: '00000000-0000-0000-0000-000000000010', name: "Leroy's Lounge" },
    currentUser: { role: 'manager', name: 'Alex', accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'] },
    menuState: makeMenuState({
      beer: [{ id: 'beer-1', name: 'Draft Lager', onMenu: true, visibility: 'public' }],
    }),
    _featuredGroups: [],
    selectMenu: (...args) => {
      selectedMenus.push(args);
    },
    getPublicHrefForCurrentMenu: () => '/leroyslounge?menu=leroys-lounge-drinks',
    loadActiveMenuState: async () => {
      loadCalls += 1;
    },
    renderPublicViews: async () => {
      renderCalls += 1;
    },
    applyDesign: () => {
      applyCalls += 1;
    },
  });
  sandbox.location.pathname = '/leroyslounge';
  sandbox.location.search = '?menu=leroys-lounge-drinks';

  const adapter = sandbox.createPublicRouteAdapter(
    getState(sandbox, 'menuState'),
    {
      currentUser: getState(sandbox, 'currentUser'),
      menuId: getState(sandbox, 'MENU_ID'),
      menuType: getState(sandbox, 'MENU_TYPE'),
      restaurantId: getState(sandbox, 'RESTAURANT_ID'),
    }
  );

  assert.equal(adapter.version, 0);
  assert.equal(adapter.snapshot.menuId, getState(sandbox, 'MENU_ID'));
  assert.equal(typeof adapter.actions.switchMenu, 'function');

  await adapter.actions.switchMenu({
    id: getState(sandbox, 'MENU_ID'),
    slug: 'leroys-lounge-drinks',
    name: "Leroy's Lounge Drinks",
    type: 'drinks',
    restaurantId: getState(sandbox, 'RESTAURANT_ID'),
  });

  assert.equal(selectedMenus.length, 1);
  assert.equal(loadCalls, 1);
  assert.equal(renderCalls, 1);
  assert.equal(applyCalls, 1);
});

test('restaurant specials service centralizes add and match flows', async () => {
  const sandbox = loadAppSandbox();
  const requestCalls = [];
  const refreshCalls = [];

  setState(sandbox, {
    MENU_ID: 'menu-main',
    RESTAURANT_ID: '00000000-0000-0000-0000-000000000010',
    currentUser: { role: 'manager', accessToken: 'token-1', accessibleMenuIds: ['00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000021'] },
    currentUserCanEditRestaurantSpecials: () => true,
    persistState: async () => true,
    _dirty: true,
    _deletedItemIds: new Set(),
    menuState: makeMenuState({
      beer: [{ id: 'beer-1', name: 'Draft Lager', onMenu: true, visibility: 'public' }],
      __uncategorized__: [{ id: 'pool-1', name: 'Off Menu Special', onMenu: true, visibility: 'off_menu' }],
    }),
    _featuredGroups: [
      {
        id: 'group-1',
        name: 'Specials',
        slots: [
          { id: 'slot-1', itemId: 'featured-1', item: { id: 'featured-1', name: 'House Spritz', price: '$9', visibility: 'public', eightySixed: false, desc: '', recipe: [], upcharges: [], showDescription: true, showRecipe: false } },
        ],
      },
    ],
    _restaurantSpecialsSiblingCatalog: [
      { id: 'sibling-1', name: 'Sibling Special', cat: 'Canned & Bottled', menuId: 'menu-sibling', menuLabel: 'Drinks', onMenu: true, visibility: 'public' },
    ],
  });

  const service = sandbox.createRestaurantSpecialsService();
  service.request = async (action, payload = {}) => {
    requestCalls.push([action, payload]);
    return {};
  };
  service.refreshForActiveMenu = async () => {
    refreshCalls.push('refresh');
    return sandbox._featuredGroups;
  };

  const matches = service.getMatches('', 'sibling');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'sibling-1');

  const added = await service.addSlot({ itemId: 'beer-1' });
  assert.equal(added.ok, true);
  assert.equal(requestCalls[0][0], 'add');
  assert.equal(refreshCalls.length, 1);
});

test('manager menu switching closes the mobile drawer after the menu refresh completes', async () => {
  const sandbox = loadAppSandbox();
  const mobileCalls = [];

  setState(sandbox, {
    currentDesign: {},
    showMenuPicker: onPick => {
      mobileCalls.push('picker');
      return onPick();
    },
    ensureCurrentMenuSession: () => ({
      refresh: async () => {
        mobileCalls.push('refresh');
      },
    }),
    applyDesign: () => {
      mobileCalls.push('design');
    },
    sbEnsureUncategorized: async () => {
      mobileCalls.push('uncategorized');
    },
    renderManagerWorkspace: () => {
      mobileCalls.push('render');
    },
    updateDraftIndicator: () => {
      mobileCalls.push('draft');
    },
    updateSaveBtn: () => {
      mobileCalls.push('save');
    },
    updateManagerActionBar: () => {
      mobileCalls.push('actionbar');
    },
    closeSettingsDrawer: () => {
      mobileCalls.push('close');
    },
  });

  sandbox.innerWidth = 920;
  sandbox.window.innerWidth = 920;
  sandbox.onSwitchMenuClick();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(mobileCalls, [
    'picker',
    'refresh',
    'design',
    'render',
    'draft',
    'save',
    'actionbar',
    'close',
  ]);

  const desktopCalls = [];
  setState(sandbox, {
    showMenuPicker: onPick => {
      desktopCalls.push('picker');
      return onPick();
    },
    ensureCurrentMenuSession: () => ({
      refresh: async () => {
        desktopCalls.push('refresh');
      },
    }),
    applyDesign: () => {
      desktopCalls.push('design');
    },
    sbEnsureUncategorized: async () => {
      desktopCalls.push('uncategorized');
    },
    renderManagerWorkspace: () => {
      desktopCalls.push('render');
    },
    updateDraftIndicator: () => {
      desktopCalls.push('draft');
    },
    updateSaveBtn: () => {
      desktopCalls.push('save');
    },
    updateManagerActionBar: () => {
      desktopCalls.push('actionbar');
    },
    closeSettingsDrawer: () => {
      desktopCalls.push('close');
    },
  });

  sandbox.innerWidth = 921;
  sandbox.window.innerWidth = 921;
  sandbox.onSwitchMenuClick();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(desktopCalls, [
    'picker',
    'refresh',
    'design',
    'render',
    'draft',
    'save',
    'actionbar',
  ]);
});

test('manager user header no longer depends on a header return button', () => {
  const sandbox = loadAppSandbox();
  const adminDrawerBtn = sandbox.document._registerElement('admin-btn-drawer', createElement('button', 'admin-btn-drawer'));

  setState(sandbox, {
    currentUser: {
      role: 'admin',
      name: 'Alex',
      accessibleMenuIds: ['menu-main'],
    },
    currentUserCanManageMenu: () => true,
    isManagerMode: true,
  });

  sandbox.renderUserHeader();
  assert.equal(adminDrawerBtn.style.display, '');
});

test('manager shell header stays minimal and action-focused', () => {
  const managerHtml = fs.readFileSync(path.join(__dirname, '..', 'manager', 'index.html'), 'utf8');

  assert.match(managerHtml, /Manager Workspace/);
  assert.match(managerHtml, /id="switch-menu-btn"[\s\S]*Menu Switcher/);
  assert.match(managerHtml, /id="admin-btn"[\s\S]*Admin Console/);
  assert.match(managerHtml, /manager-shell-legacy-hooks/);
  assert.doesNotMatch(managerHtml, /Current Menu Control Room/);
  assert.doesNotMatch(managerHtml, /manager-shell-header-summary/);
});

test('public route contract and route renderers register and hydrate both restaurant shells', async () => {
  const routeCases = [
    {
      file: path.join(__dirname, '..', 'leroyslounge', 'app.js'),
      prefix: 'll',
      restaurantId: '00000000-0000-0000-0000-000000000010',
      restaurantName: "Leroy's Lounge",
      menuId: '00000000-0000-0000-0000-000000000020',
      menuName: "Leroy's Lounge Drinks",
    },
    {
      file: path.join(__dirname, '..', 'elroyscantina', 'app.js'),
      prefix: 'erc',
      restaurantId: '00000000-0000-0000-0000-000000000001',
      restaurantName: "El Roy's Cantina",
      menuId: '00000000-0000-0000-0000-000000000002',
      menuName: "El Roy's Cantina Drinks",
    },
  ];

  for (const routeCase of routeCases) {
    const sandbox = loadAppSandbox();
    const { page, settingsWrapper } = setupRouteDom(sandbox, routeCase.prefix);
    setState(sandbox, {
      _siteRestaurant: { id: routeCase.restaurantId, name: routeCase.restaurantName },
      RESTAURANT_ID: routeCase.restaurantId,
      MENU_ID: routeCase.menuId,
      MENU_TYPE: 'drinks',
      _activeMenuName: routeCase.menuName,
      _activeRestaurantName: routeCase.restaurantName,
      _featuredGroups: [
        {
          id: 'group-1',
          name: 'Specials',
          slots: Array.from({ length: 5 }, (_, index) => ({
            id: `slot-${index + 1}`,
            itemId: `special-${index + 1}`,
            sellNote: '',
            item: {
              id: `special-${index + 1}`,
              name: `House Margarita ${index + 1}`,
              price: '$12',
              visibility: 'public',
              eightySixed: false,
              desc: 'Citrus and salt',
              recipe: ['tequila', 'lime'],
              upcharges: [],
              showDescription: true,
              showRecipe: true,
            },
          })),
        },
      ],
      menuState: makeMenuState({
        beer: [{ id: 'beer-1', name: 'Draft Beer', price: '$8', onMenu: true, visibility: 'public' }],
      }),
      currentUser: { role: 'manager', name: 'Alex', accessibleMenuIds: [routeCase.menuId] },
      currentUserCanEditRestaurantSpecials: () => true,
      getManagedCategoryDefs: () => [{ id: 'beer', title: 'Beers on Tap', icon: '🍺' }],
      getLastUpdatedTs: () => '1712705100000',
    });

    loadScript(routeCase.file, sandbox);

    const renderer = sandbox.__publicRouteRenderer;
    assert.ok(renderer, `${routeCase.prefix} renderer did not register`);
    assert.equal(renderer.restaurantId, routeCase.restaurantId);

    const contract = {
      snapshot: {
        activeMenuName: routeCase.menuName,
        appVersion: getState(sandbox, 'APP_VERSION'),
        canEditRestaurantSpecials: true,
        categoryDefs: [{ id: 'beer', title: 'Beers on Tap', icon: '🍺' }],
        currentUser: getState(sandbox, 'currentUser'),
        featuredGroups: getState(sandbox, '_featuredGroups'),
        isPreview: true,
        knownMenus: [{ id: routeCase.menuId, restaurantId: routeCase.restaurantId, type: 'drinks', name: routeCase.menuName, slug: 'test-slug' }],
        lastUpdatedTs: '1712705100000',
        menuId: routeCase.menuId,
        menuState: getState(sandbox, 'menuState'),
        menuType: 'drinks',
        restaurantId: routeCase.restaurantId,
        restaurantSpecials: getState(sandbox, '_featuredGroups')[0],
        siteRestaurant: getState(sandbox, '_siteRestaurant'),
      },
      helpers: {
        escHtml: value => String(value || ''),
        formatUpdatedAt: () => 'Thu, Apr 9 at 7:25 PM',
        getMenuTypeLabel: value => String(value || ''),
      },
      actions: {
        closeDropdowns() {
          settingsWrapper.style.display = 'none';
        },
        canManageMenu() {
          return true;
        },
        openManager() {},
        openAdmin() {},
        switchMenu: async () => ({ ok: true }),
      },
    };

    assert.equal(renderer.boot(contract), true);
    assert.equal(renderer.render(contract), true);

    const footerVersion = sandbox.document.getElementById(
      routeCase.prefix === 'll' ? 'll-route-footer-version' : 'erc-route-footer-version'
    );
    const footerTimestamp = sandbox.document.getElementById(
      routeCase.prefix === 'll' ? 'll-route-footer-timestamp' : 'erc-route-footer-timestamp'
    );
    const menuNameEl = routeCase.prefix === 'll'
      ? sandbox.document.getElementById('ll-route-menu-name')
      : null;
    const featuredWrap = sandbox.document.getElementById(
      routeCase.prefix === 'll' ? 'll-route-specials' : 'erc-route-specials'
    );

    const escapedVersion = String(getState(sandbox, 'APP_VERSION')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(footerVersion.innerHTML, new RegExp(escapedVersion));
    assert.match(footerVersion.innerHTML, /PREVIEW/);
    assert.equal(footerTimestamp.textContent, 'Thu, Apr 9 at 7:25 PM');
    if (menuNameEl) assert.equal(menuNameEl.textContent, routeCase.menuName);
    assert.match(featuredWrap.innerHTML, /House Margarita 1/);
    assert.match(featuredWrap.innerHTML, /House Margarita 5/);
    assert.equal(page.classList.contains('is-mobile-expanded'), false);
    assert.equal(page.classList.contains('is-mobile-compact'), false);
    assert.equal(page.classList.contains('is-near-top'), false);
  }
});

test('public staff footer state exposes sign-in and quiet utility links by role', () => {
  const sandbox = loadAppSandbox();

  setState(sandbox, {
    MENU_ID: '00000000-0000-0000-0000-000000000020',
    RESTAURANT_ID: '00000000-0000-0000-0000-000000000010',
    currentUser: null,
  });
  const signedOut = sandbox.buildPublicStaffFooterState();
  assert.equal(signedOut.signIn.label, 'Staff Sign-In');
  assert.equal(signedOut.links.length, 0);

  setState(sandbox, {
    currentUser: {
      role: 'manager',
      accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'],
    },
  });
  const managerState = sandbox.buildPublicStaffFooterState();
  assert.equal(managerState.links.map(link => link.label).join(','), 'Manager,Sign Out');
  const pickerManagerState = sandbox.buildPublicStaffFooterState(getState(sandbox, 'currentUser'), {
    menuId: '',
    restaurantId: '',
  });
  assert.equal(pickerManagerState.links.map(link => link.label).join(','), 'Manager,Sign Out');

  setState(sandbox, {
    currentUser: {
      role: 'admin',
      accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'],
    },
  });
  const adminState = sandbox.buildPublicStaffFooterState();
  assert.equal(adminState.links.map(link => link.label).join(','), 'Manager,Admin,Sign Out');
  const pickerAdminState = sandbox.buildPublicStaffFooterState(getState(sandbox, 'currentUser'), {
    menuId: '',
    restaurantId: '',
  });
  assert.equal(pickerAdminState.links.map(link => link.label).join(','), 'Manager,Admin,Sign Out');
});

test('picker init bootstraps shared session state without requiring the app shell', async () => {
  const sandbox = loadAppSandbox();
  const calls = [];

  sandbox.fetch = async url => {
    if (String(url) === '/api/auth?mode=bootstrap') {
      calls.push('bootstrap');
      return {
        ok: true,
        json: async () => ({
          config: {
            supabaseUrl: 'https://example.supabase.co',
            supabaseAnonKey: 'anon-key',
          },
        }),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  sandbox.window.fetch = sandbox.fetch;

  setState(sandbox, {
    _appPageMode: 'picker',
    showPickerPage: () => {
      calls.push('picker');
    },
    loadLocalConfig: () => {
      calls.push('local-config');
    },
    _tryHandleRecoveryCallback: async () => {
      calls.push('recovery');
      return false;
    },
    _tryRestoreSession: async () => {
      calls.push('restore');
      return { restored: true };
    },
    renderUserHeader: () => {
      calls.push('render-header');
    },
    syncPublicStaffFooterActions: () => {
      calls.push('sync-footer');
    },
    showAppShell: () => {
      calls.push('shell');
    },
  });

  await sandbox.init();

  assert.deepEqual(calls, ['picker', 'local-config', 'bootstrap', 'recovery', 'restore', 'render-header', 'sync-footer']);
});

test('menu fallback store keys snapshots by menu identity and menu type', () => {
  const sandbox = loadAppSandbox();
  const menus = getState(sandbox, 'MENUS');
  const restaurants = getState(sandbox, 'RESTAURANTS');
  const store = sandbox.createMenuFallbackStore({
    storage: sandbox.localStorage,
    storageKey: 'hf_menu_cache_test',
  });

  const drinksContext = {
    menuId: menus.ELROYS_DRINKS.id,
    restaurantId: restaurants.ELROYS.id,
    menuType: 'drinks',
  };
  const foodContext = {
    menuId: menus.ELROYS_FOOD.id,
    restaurantId: restaurants.ELROYS.id,
    menuType: 'food',
  };

  assert.equal(store.persist(drinksContext, { context: drinksContext, cats: [{ key: 'beer' }] }), true);
  assert.equal(store.persist(foodContext, { context: foodContext, cats: [{ key: 'tacos' }] }), true);

  const restoredFood = store.restore(foodContext);
  assert.equal(restoredFood.cats[0].key, 'tacos');

  const wrongType = store.restore({ ...foodContext, menuType: 'drinks' });
  assert.equal(wrongType, null);
});

test('fallback defaults reset category definitions by menu type', () => {
  const sandbox = loadAppSandbox();
  const menus = getState(sandbox, 'MENUS');
  const restaurants = getState(sandbox, 'RESTAURANTS');
  setState(sandbox, {
    MENU_ID: menus.ELROYS_FOOD.id,
    MENU_TYPE: 'food',
    RESTAURANT_ID: restaurants.ELROYS.id,
  });

  const result = sandbox.restoreMenuStateFromFallback({
    menuId: menus.ELROYS_FOOD.id,
    restaurantId: restaurants.ELROYS.id,
    menuType: 'food',
  });

  assert.equal(result.source, 'default');
  const categoryIds = getState(sandbox, 'CATEGORY_DEFS.map(cat => cat.id)');
  assert.equal(Array.from(categoryIds).slice(0, 3).join(','), 'starters,tacos,entrees');
});

test('menu link resolver uses per-menu configuration with canonical route fallback', () => {
  const sandbox = loadAppSandbox();
  const menus = getState(sandbox, 'MENUS');
  const restaurants = getState(sandbox, 'RESTAURANTS');

  setState(sandbox, {
    MENU_ID: menus.LEROYS_DRINKS.id,
    MENU_TYPE: 'drinks',
    RESTAURANT_ID: restaurants.LEROYS.id,
    NOTIFICATIONS: { menu_url: 'https://menus.example.com/leroys-drinks' },
    _activeMenuName: "Leroy's Lounge Drinks",
  });
  assert.equal(sandbox.getNotificationMenuLink(), 'https://menus.example.com/leroys-drinks');

  setState(sandbox, {
    MENU_ID: menus.ELROYS_DRINKS.id,
    MENU_TYPE: 'drinks',
    RESTAURANT_ID: restaurants.ELROYS.id,
    NOTIFICATIONS: {},
    _activeMenuName: "El Roy's Cantina Drinks",
  });
  assert.equal(
    sandbox.getNotificationMenuLink(),
    'https://example.com/elroyscantina?menu=drinks'
  );
});

test('public render coordinator dedupes queued rerenders and skips hidden shells', async () => {
  const sandbox = loadAppSandbox();
  let renderCount = 0;
  const coordinator = sandbox.createPublicRenderCoordinator({
    renderer: async () => {
      renderCount += 1;
    },
    isVisible: () => true,
  });

  await Promise.all([coordinator.schedule({ cause: 'menu-switch' }), coordinator.schedule({ cause: 'menu-switch' })]);
  assert.equal(renderCount, 1);

  let releaseFirstRender;
  const rerenderCoordinator = sandbox.createPublicRenderCoordinator({
    renderer: async () => {
      renderCount += 1;
      if (renderCount === 2) {
        await new Promise(resolve => {
          releaseFirstRender = resolve;
        });
      }
    },
    isVisible: () => true,
  });

  const first = rerenderCoordinator.schedule({ cause: 'first-pass' });
  await Promise.resolve();
  const second = rerenderCoordinator.schedule({ cause: 'inflight-request' });
  releaseFirstRender();
  await Promise.all([first, second]);
  assert.equal(renderCount, 3);

  let hiddenCount = 0;
  const hiddenCoordinator = sandbox.createPublicRenderCoordinator({
    renderer: async () => {
      hiddenCount += 1;
    },
    isVisible: () => false,
  });
  const hiddenResult = await hiddenCoordinator.schedule({ cause: 'hidden' });
  assert.equal(hiddenCount, 0);
  assert.equal(hiddenResult.skipped, 'hidden');
});

test('menu poll scheduler is single-flight and ignores stale poll results', async () => {
  const sandbox = loadAppSandbox();
  const resolverQueue = [];
  const loaderCalls = [];
  const appliedResults = [];
  let errorCount = 0;
  const scheduler = sandbox.createMenuPollScheduler({
    loader: async ({ reason }) => {
      loaderCalls.push(reason);
      return await new Promise(resolve => resolverQueue.push(resolve));
    },
    onResult: async result => {
      appliedResults.push(result.id);
      return result;
    },
    onError: () => {
      errorCount += 1;
    },
    getContextKey: () => 'menu-main|drinks|restaurant-main',
  });

  const intervalRun = scheduler.tick();
  const resumeRun = scheduler.resume();
  assert.equal(loaderCalls.length, 1);

  resolverQueue.shift()({ id: 'old-result' });
  for (let i = 0; i < 10 && loaderCalls.length < 2; i += 1) {
    await Promise.resolve();
  }
  assert.equal(loaderCalls.length, 2);

  resolverQueue.shift()({ id: 'new-result' });
  await Promise.all([intervalRun, resumeRun]);

  assert.deepEqual(appliedResults, ['new-result']);
  assert.equal(errorCount, 0);
});

test('featured view policy filters sell notes by explicit staff visibility', () => {
  const sandbox = loadAppSandbox();
  const groups = [
    {
      id: 'featured-group-1',
      name: 'Specials',
      slots: [
        {
          id: 'slot-1',
          itemId: 'item-1',
          sellNote: 'Staff-only note',
          item: { id: 'item-1', name: 'Margarita' },
        },
      ],
    },
  ];
  const policy = sandbox.createFeaturedViewPolicy({ actorResolver: () => ({ role: 'none' }) });
  const anonSnapshot = policy.buildSnapshot({
    actor: { role: 'none' },
    restaurantId: '00000000-0000-0000-0000-000000000001',
    featuredGroups: groups,
  });
  assert.equal(anonSnapshot.featuredGroups[0].slots[0].sellNote, '');

  const managerSnapshot = policy.buildSnapshot({
    actor: { role: 'manager' },
    restaurantId: '00000000-0000-0000-0000-000000000001',
    featuredGroups: groups,
  });
  assert.equal(managerSnapshot.featuredGroups[0].slots[0].sellNote, 'Staff-only note');
});

test('manager route keeps notification delivery behind the shared authorization boundary', () => {
  const notifySource = fs.readFileSync(path.join(__dirname, '..', 'api', 'manager.js'), 'utf8');
  const vercelConfig = fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8');

  assert.match(notifySource, /authorizeNotificationRequest/);
  assert.match(notifySource, /deliverMenuNotification/);
  assert.doesNotMatch(vercelConfig, /\/api\/send-groupme/);
  assert.doesNotMatch(vercelConfig, /\/api\/config/);
  assert.doesNotMatch(vercelConfig, /\/api\/role/);
});

test('auth route handles bootstrap and profile modes via shared auth helper boundaries', () => {
  const bootstrapSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'auth.js'), 'utf8');

  assert.match(bootstrapSource, /createBootstrapResponse/);
  assert.match(bootstrapSource, /createProfileResponse/);
  assert.match(bootstrapSource, /executeAuthAction/);
  assert.match(bootstrapSource, /mode === 'profile'/);
});

test('runtime bootstrap and auth profile boundaries consume the consolidated auth endpoint', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const authApiSource = fs.readFileSync(path.join(__dirname, '..', 'core', 'auth', 'auth-api.js'), 'utf8');

  assert.match(appSource, /readSessionBootstrapThroughApi/);
  assert.match(appSource, /\/api\/auth\?mode=bootstrap/);
  assert.doesNotMatch(appSource, /fetch\('\/api\/config'/);
  assert.doesNotMatch(appSource, /fetch\('\/api\/role'/);
  assert.match(authApiSource, /\/api\/auth\?mode=profile/);
  assert.doesNotMatch(authApiSource, /fetch\('\/api\/role'/);
});

test('runtime workspace and history boundaries request server restaurant-tools and scoped history', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  assert.match(appSource, /params\.set\('include', 'restaurant-tools'\)/);
  assert.match(appSource, /scope: canReadRestaurantTools \? 'restaurant' : 'menu'/);
  assert.doesNotMatch(appSource, /rest\/v1\/update_log/);
});

test('admin route delegates landing parsing through a non-api helper module', () => {
  const importSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  assert.match(importSource, /from '\.\.\/server\/_landing-import\.js'/);
  assert.doesNotMatch(importSource, /from '\.\/_landing-import\.js'/);
});
