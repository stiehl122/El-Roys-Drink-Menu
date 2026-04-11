const assert = require('node:assert/strict');
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
    finalizePersistStatus() {},
    commitDraft() {},
    buildPreview: snapshot => ({
      hasChanges: true,
      diff,
      sections: diff,
      patchMessage: 'Patch message',
      truncated: false,
      snapshot,
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
  const persistCalls = [];
  const patchCalls = [];
  const commitCalls = [];
  const finalizeCalls = [];

  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts({
    persistState: async options => {
      persistCalls.push(options);
      return true;
    },
    patchMenuMeta: async update => {
      patchCalls.push(update);
      return { downgradedFields: [] };
    },
    commitDraft: ts => {
      commitCalls.push(ts);
    },
    finalizePersistStatus: ok => {
      finalizeCalls.push(ok);
    },
  }));

  const result = await lifecycle.saveDraft();

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.source, 'saved');
  assert.equal(persistCalls.length, 1);
  assert.equal(patchCalls[0].last_updated_ts, 1712705100000);
  assert.deepEqual(commitCalls, [1712705100000]);
  assert.deepEqual(finalizeCalls, []);
});

test('menu session lifecycle publishes updates through one preview-aware boundary', async () => {
  const sandbox = loadAppSandbox();
  const persistCalls = [];
  const patchCalls = [];
  const commitCalls = [];

  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts({
    persistState: async options => {
      persistCalls.push(options);
      return true;
    },
    patchMenuMeta: async update => {
      patchCalls.push(['primary', update]);
      return { downgradedFields: ['last_sent_featured'] };
    },
    patchMenuMetaForMenu: async (menuId, update) => {
      patchCalls.push([menuId, update]);
      return { downgradedFields: [] };
    },
    commitPublished: payload => {
      commitCalls.push(payload);
    },
  }));

  const preview = lifecycle.preview();
  const result = await lifecycle.publishUpdate({ preview });

  assert.equal(result.ok, true);
  assert.equal(result.notificationStatus.statusCode, 207);
  assert.equal(result.preview, preview);
  assert.equal(persistCalls.length, 1);
  assert.equal(persistCalls[0].silentFailure, true);
  assert.ok(result.warnings.some(message => message.includes('Some notification channels failed: SMS.')));
  assert.ok(result.warnings.some(message => message.includes('legacy metadata compatibility')));
  assert.ok(result.warnings.some(message => message.includes('local cache')));
  assert.ok(result.warnings.some(message => message.includes('audit log')));
  assert.equal(patchCalls[0][0], 'primary');
  assert.equal(patchCalls[1][0], 'menu-sibling');
  assert.equal(commitCalls[0].ts, 1712705100000);
  assert.equal(commitCalls[0].featuredIds[0], 'feature-1');
});

test('menu session lifecycle can publish without firing notifications', async () => {
  const sandbox = loadAppSandbox();
  const persistCalls = [];
  let notificationCalls = 0;

  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts({
    canEditRestaurantSpecials: () => false,
    getRestaurantMenuIds: () => [],
    dispatchNotification: async () => {
      notificationCalls += 1;
      return { ok: true, statusCode: 200, summary: { anyOk: true, anyError: false, failedChannels: [], allSkipped: false } };
    },
    persistState: async options => {
      persistCalls.push(options);
      return true;
    },
    syncLocalCache: () => true,
    logUpdate: async () => true,
  }));

  const result = await lifecycle.publishUpdate({ notify: false });

  assert.equal(result.ok, true);
  assert.equal(result.notificationStatus, null);
  assert.equal(notificationCalls, 0);
  assert.equal(persistCalls.length, 1);
  assert.equal(persistCalls[0].silentFailure, true);
  assert.equal(result.warnings.length, 0);
  assert.match(result.successMessage, /saved to the live menu/i);
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

  assert.equal(summary.textContent, '2 pending changes. Save Draft keeps them private. Save opens Patch Notes Preview.');
  assert.equal(saveBtn.disabled, false);
  assert.equal(sendBtn.disabled, false);
  assert.equal(bar.classList.contains('is-idle'), false);
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
  assert.equal(typeof contract.actions.switchMenu, 'function');

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
    'uncategorized',
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
    'uncategorized',
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

    assert.match(footerVersion.innerHTML, /v0\.8\.6/);
    assert.match(footerVersion.innerHTML, /PREVIEW/);
    assert.equal(footerTimestamp.textContent, 'Thu, Apr 9 at 7:25 PM');
    if (menuNameEl) assert.equal(menuNameEl.textContent, routeCase.menuName);
    assert.match(featuredWrap.innerHTML, /House Margarita 1/);
    assert.match(featuredWrap.innerHTML, /House Margarita 5/);
    assert.equal(page.classList.contains('is-mobile-expanded') || page.classList.contains('is-mobile-compact'), true);
  }
});
