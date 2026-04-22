# App.js Session/Data Runtime Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink `app.js` by moving the menu session lifecycle, quiet-save vs send-update behavior, draft rehydration, state loading, and polling runtime into the existing `core/session/*` and `core/data/*` deep modules without changing current behavior.

**Architecture:** Treat `app.js` as the browser wiring layer, not the owner of session/data logic. Deepen `core/session/menu-session.js`, `core/session/publish-service.js`, `core/data/menu-state-loader.js`, and `core/session/poll-scheduler.js` until they own the real behavior, then replace the remaining `app.js` bodies with thin wrappers and compatibility shims. Keep `createRestaurantSpecialsService()` in `app.js` for now because it owns restaurant-specials CRUD and catalog composition, not generic session lifecycle; only `refreshFeaturedForActiveMenu()` should cross the session/data boundary as a dependency.

**Tech Stack:** Plain browser JavaScript, `node --test`, `node --check`, no bundler, no dependencies.

---

## File Map

| File | Responsibility after this plan |
|---|---|
| `app.js` | Thin browser adapters only for `getMenuSessionPorts()`, `createMenuSessionLifecycle()`, `ensureCurrentMenuSession()`, `createMenuStateLoaderService()`, `loadActiveMenuState()`, `startPolling()`, `stopPolling()`, and compatibility wrappers for `getMenuActionState()` / `updateSaveBtn()`. |
| `core/session/menu-session.js` | Own the real session lifecycle implementation: request sync, route-first open/refresh, preview/save/send entrypoints, and unavailable-service behavior. |
| `core/session/publish-service.js` | Own quiet-save vs send-update branching, preview/save no-op handling, and the shared publish service contract used by the session lifecycle. |
| `core/data/menu-state-loader.js` | Own load/poll behavior, draft-envelope reapplication, featured refresh sequencing, default fallback resets, and dirty-state reconciliation. |
| `core/session/poll-scheduler.js` | Own both the request de-duping scheduler and a new browser poll controller that starts/stops intervals and visibility listeners. |
| `tests/boundaries/publish.boundary.test.cjs` | Boundary tests for shared publish behavior and session lifecycle publish entrypoints. |
| `tests/boundaries/session.boundary.test.cjs` | Boundary tests for loader behavior, draft restoration, featured refresh sequencing, and poll behavior. |
| `tests/phase2-session-boundaries.test.cjs` | Guardrail tests that `app.js` stays thin and delegates to `core/session/*` + `core/data/*` without carrying shadow implementations. |
| `tests/architecture-boundaries.test.cjs` | Guardrail coverage for action-bar/draft-ledger behavior after `getMenuActionState()` and `updateSaveBtn()` become compatibility wrappers. |

## Scope Notes

- `app.js:2810-3451` is the main session/publish hotspot.
- `app.js:6408-6670` is the main loader hotspot.
- `app.js:8563-8714` is the main polling hotspot.
- `app.js:1255-1337` is duplicate action-bar logic that should collapse to the existing draft-ledger boundary.
- `app.js:6233-6405` should stay out of this refactor except for `refreshFeaturedForActiveMenu()` remaining an injected dependency.

### Task 1: Add failing guardrail tests for the end-state split

**Files:**
- Modify: `tests/phase2-session-boundaries.test.cjs:6-125`
- Modify: `tests/boundaries/session.boundary.test.cjs:70-286`
- Modify: `tests/architecture-boundaries.test.cjs:618-770`
- Test: `tests/phase2-session-boundaries.test.cjs`
- Test: `tests/boundaries/session.boundary.test.cjs`
- Test: `tests/architecture-boundaries.test.cjs`

- [ ] **Step 1: Add a phase-2 source guardrail that fails while `app.js` still carries inline lifecycle, loader, and polling bodies**

```js
const fs = require('node:fs');
const path = require('node:path');

function readSource(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

test('app session/data wrappers stay thin after the runtime split', () => {
  const source = readSource('../app.js');
  const lifecycleStart = source.indexOf('function createMenuSessionLifecycle(');
  const lifecycleEnd = source.indexOf('function ensureCurrentMenuSession(', lifecycleStart);
  const lifecycleSource = source.slice(lifecycleStart, lifecycleEnd);
  const loaderStart = source.indexOf('function createMenuStateLoaderService(');
  const loaderEnd = source.indexOf('async function _loadActiveMenuStateInternal(', loaderStart);
  const loaderSource = source.slice(loaderStart, loaderEnd);
  const pollStart = source.indexOf('function createMenuPollScheduler(');
  const pollEnd = source.indexOf('function getLastUpdatedTs(', pollStart);
  const pollSource = source.slice(pollStart, pollEnd);
  const actionStart = source.indexOf('function getMenuActionState(');
  const actionEnd = source.indexOf('function getCachedDiff(', actionStart);
  const actionSource = source.slice(actionStart, actionEnd);

  assert.match(lifecycleSource, /boundary\\.createMenuSessionLifecycle/);
  assert.doesNotMatch(lifecycleSource, /async open\\(/);
  assert.match(loaderSource, /boundary\\.createMenuStateLoaderService/);
  assert.doesNotMatch(loaderSource, /async load\\(/);
  assert.match(pollSource, /createMenuPollController|boundary\\.createMenuPollScheduler/);
  assert.doesNotMatch(pollSource, /let activeToken = 0/);
  assert.match(actionSource, /createDraftLedgerService\\(\\)\\.getActionBarState/);
  assert.doesNotMatch(actionSource, /countDiffLines\\(/);
});
```

- [ ] **Step 2: Add a loader-boundary test for poll-time featured refresh and draft reconciliation**

```js
test('menu state loader boundary refreshes featured data only when poll detects new live data', async () => {
  const sandbox = loadAppSandbox();
  const refreshCalls = [];
  const dirtyStates = [];
  let currentTs = '1000';

  const service = sandbox.createMenuStateLoaderService({
    readState: async () => ({
      cats: [{ key: 'beer', items: [{ id: 'lager' }] }],
      meta: { lastUpdatedTs: currentTs },
      restaurant: { id: 'restaurant-main', name: 'Main Restaurant' },
      workspace: {
        actor: { id: 'user-1', role: 'manager' },
        permissions: { canManage: true },
      },
    }),
    hydrateFromState: data => {
      currentTs = String(data.meta.lastUpdatedTs);
    },
    getLastUpdatedTs: () => currentTs,
    getCategorySnapshot: () => JSON.stringify([{ key: 'beer', items: [{ id: 'lager' }] }]),
    getDesignSnapshot: () => JSON.stringify({ mode: 'default' }),
    getFeaturedSnapshot: () => JSON.stringify([{ id: 'feature-1' }]),
    readStoredLocalDraftEnvelope: () => null,
    buildCurrentLocalDraftEnvelope: () => null,
    alignLocalDraftEnvelope: envelope => envelope,
    applyLocalDraftEnvelope: () => false,
    clearCurrentLocalDraft: () => {},
    syncLocalDraftDirtyState: () => false,
    setDirty: value => {
      dirtyStates.push(value);
    },
    clearDraftChanges: () => {},
    writeMenuCache: () => {},
    refreshFeatured: async () => {
      refreshCalls.push(currentTs);
    },
    buildSnapshot: source => ({ source }),
  });

  currentTs = '1000';
  const first = await service.poll({ request: { pageMode: 'public' } });
  currentTs = '2000';
  const second = await service.poll({ request: { pageMode: 'public' } });

  assert.equal(first.changed, false);
  assert.equal(second.changed, true);
  assert.deepEqual(refreshCalls, ['2000']);
  assert.deepEqual(dirtyStates, [false, false]);
});
```

- [ ] **Step 3: Add an architecture guardrail proving the old action-button logic is only a compatibility shim**

```js
test('legacy action-button helpers collapse to the draft-ledger and manager-workspace boundaries', () => {
  const source = read('app.js');
  const getMenuActionStateStart = source.indexOf('function getMenuActionState(');
  const getMenuActionStateEnd = source.indexOf('function updateSaveBtn(', getMenuActionStateStart);
  const getMenuActionStateSource = source.slice(getMenuActionStateStart, getMenuActionStateEnd);
  const updateSaveBtnStart = source.indexOf('function updateSaveBtn(');
  const updateSaveBtnEnd = source.indexOf('function getCachedDiff(', updateSaveBtnStart);
  const updateSaveBtnSource = source.slice(updateSaveBtnStart, updateSaveBtnEnd);

  assert.match(getMenuActionStateSource, /createDraftLedgerService\\(\\)\\.getActionBarState/);
  assert.doesNotMatch(getMenuActionStateSource, /saveLabel:\\s*'Save Quietly'/);
  assert.match(updateSaveBtnSource, /updateManagerActionBar\\(/);
  assert.doesNotMatch(updateSaveBtnSource, /document\\.getElementById\\('save-btn'\\)/);
});
```

- [ ] **Step 4: Run the targeted tests to verify they fail before implementation**

Run: `node --test tests/phase2-session-boundaries.test.cjs tests/boundaries/session.boundary.test.cjs tests/architecture-boundaries.test.cjs --test-name-pattern "runtime split|featured data only when poll detects new live data|legacy action-button helpers"`

Expected: FAIL because `app.js` still contains inline lifecycle/loader/poll/action-state logic and the loader poll path does not yet have a dedicated regression test.

- [ ] **Step 5: Commit the red-test checkpoint**

```bash
git add tests/phase2-session-boundaries.test.cjs tests/boundaries/session.boundary.test.cjs tests/architecture-boundaries.test.cjs
git commit -m "test: add app session runtime split guardrails"
```

### Task 2: Move publish/session behavior fully behind `core/session/*`

**Files:**
- Modify: `core/session/publish-service.js:1-108`
- Modify: `core/session/menu-session.js:1-197`
- Modify: `app.js:2810-3451`
- Modify: `tests/boundaries/publish.boundary.test.cjs:78-334`
- Test: `tests/boundaries/publish.boundary.test.cjs`
- Test: `tests/phase2-session-boundaries.test.cjs`

- [ ] **Step 1: Deepen `core/session/publish-service.js` so it owns publish mode inference and save/send behavior instead of bouncing back into app-owned shadow code**

```js
function inferPublishIntent(options = {}, preview = {}) {
  if (options.intent) return options.intent;
  if (options.mode === 'save') return 'save';
  if (options.mode === 'send') return 'send';
  if (options.notify === false) return 'save';
  if (preview.mode === 'send' || preview.mode === 'update-only') return 'send';
  return 'save-and-send';
}

function createMenuPublishServiceImpl(sessionPorts, runtime = {}, options = {}) {
  const moduleCreatePublishFacade = typeof modules.createMenuPublishFacade === 'function'
    ? modules.createMenuPublishFacade
    : null;
  const globalCreatePublishFacade = typeof globalScope.createMenuPublishFacade === 'function'
    ? globalScope.createMenuPublishFacade.bind(globalScope)
    : null;
  const createPublishFacade = typeof runtime.createPublishFacade === 'function'
    ? runtime.createPublishFacade
    : (moduleCreatePublishFacade || globalCreatePublishFacade);
  const facade = typeof createPublishFacade === 'function'
    ? createPublishFacade(sessionPorts, runtime)
    : null;
  let fallbackService = null;
  const buildSnapshot = typeof runtime.buildSnapshot === 'function'
    ? runtime.buildSnapshot
    : (() => ({ source: 'unknown' }));
  const buildPreview = typeof runtime.buildPreview === 'function'
    ? runtime.buildPreview
    : (() => sessionPorts.buildPreview?.(buildSnapshot('preview')));

  function getFallbackService() {
    if (fallbackService !== null) return fallbackService;
    fallbackService = typeof options.fallback === 'function' ? options.fallback() : undefined;
    return fallbackService;
  }

  function getUnavailableResult(message, preview = null) {
    return {
      ok: false,
      userHandled: false,
      userMessage: message,
      preview: preview || buildPreview(),
      snapshot: buildSnapshot('publish-unavailable'),
    };
  }

  function buildSaveDraftNoop(preview, source = 'draft-noop') {
    return {
      ok: false,
      noop: true,
      preview,
      snapshot: buildSnapshot(source),
    };
  }

  async function prepare(opts = {}) {
    if (facade && typeof facade.prepare === 'function') return facade.prepare(opts);
    const fallback = getFallbackService();
    if (fallback && typeof fallback.prepare === 'function') return fallback.prepare(opts);
    return getUnavailableResult('Publish service is unavailable.');
  }

  async function saveDraft(opts = {}) {
    const preview = opts.preview?.sections ? opts.preview : buildPreview();
    const hasLocalDraft = !!buildSnapshot('draft')?.dirty || !!preview?.hasLocalDraft;
    const hasChanges = !!preview?.hasChanges;
    if (!hasLocalDraft || !hasChanges) return buildSaveDraftNoop(preview);

    if (facade && typeof facade.commit === 'function') {
      return facade.commit({ ...opts, intent: 'save' });
    }
    const fallback = getFallbackService();
    if (fallback && typeof fallback.saveDraft === 'function') return fallback.saveDraft(opts);
    return getUnavailableResult('Publish service is unavailable.', preview);
  }

  async function publishUpdate(opts = {}) {
    const preview = opts.preview?.sections ? opts.preview : buildPreview();
    const intent = inferPublishIntent(opts, preview);

    if (facade && typeof facade.commit === 'function') {
      return facade.commit({ ...opts, preview, intent });
    }
    const fallback = getFallbackService();
    if (fallback && typeof fallback.publishUpdate === 'function') {
      return fallback.publishUpdate({ ...opts, preview, intent });
    }
    return getUnavailableResult('Publish service is unavailable.', preview);
  }

  return {
    prepare,
    saveDraft,
    publishUpdate,
  };
}
```

- [ ] **Step 2: Remove the inline lifecycle fallback from `app.js` and make `core/session/menu-session.js` the only owner of session behavior**

```js
function createMenuSessionLifecycle(ports) {
  const sessionPorts = ports || getMenuSessionPorts();
  const boundary = getSessionModuleBoundary();
  if (typeof boundary?.createMenuSessionLifecycle !== 'function') {
    throw new Error('createMenuSessionLifecycle boundary is unavailable');
  }
  return boundary.createMenuSessionLifecycle(sessionPorts, {
    getMenuSessionPorts,
    createPublishService,
  });
}

function ensureCurrentMenuSession(overrides = {}) {
  _currentMenuSession ??= createMenuSessionLifecycle();
  _currentMenuSession.syncRequest(overrides);
  return _currentMenuSession;
}
```

Use this matching module-side session implementation in `core/session/menu-session.js` so the behavior previously duplicated in `app.js` still exists:

```js
modules.createMenuSessionLifecycle = function createMenuSessionLifecycleBoundary(ports, options = {}) {
  if (options && typeof options.impl === 'function') {
    return options.impl(ports, options);
  }
  return createMenuSessionLifecycleImpl(ports, options);
};
```

Keep `createMenuSessionLifecycleImpl()` as the real owner of `open()`, `refresh()`, `preview()`, `preparePublish()`, `commitPublish()`, `saveDraft()`, and `publishUpdate()`.

- [ ] **Step 3: Shrink `getMenuSessionPorts()` so it only exposes browser/runtime adapters, not session policy**

```js
function getMenuSessionPorts() {
  return {
    buildRequest(overrides = {}) {
      return buildCurrentMenuPageRequest(overrides);
    },
    buildSnapshot(source = 'live', request = buildCurrentMenuPageRequest()) {
      return buildMenuSessionSnapshot(source, request);
    },
    async resolveMenu() {
      return sbResolveMenu();
    },
    canLoadFromNetwork() {
      return !!MENU_ID;
    },
    restoreFallback({ expectedRestaurantId = '', request = {} } = {}) {
      const requestedMenu = getMenuById(request.requestedMenuId) || getMenuBySlug(request.requestedMenuSlug || '');
      const fallback = restoreMenuStateFromFallback({
        menuId: request.requestedMenuId || requestedMenu?.id || MENU_ID,
        menuSlug: request.requestedMenuSlug || requestedMenu?.slug || '',
        restaurantId: expectedRestaurantId || requestedMenu?.restaurantId || request.siteRestaurantId || RESTAURANT_ID,
        menuType: requestedMenu?.type || MENU_TYPE,
      });
      return {
        source: fallback.source,
        usedFallback: fallback.usedFallback,
        snapshot: fallback.snapshot || buildMenuSessionSnapshot(fallback.source || 'fallback', request),
      };
    },
    async loadState(options = {}) {
      return _loadActiveMenuStateInternal(options);
    },
    async pollState(options = {}) {
      return _pollActiveMenuStateInternal(options);
    },
    now() {
      return Date.now();
    },
    async persistState(options = {}) {
      return persistState(options);
    },
    async patchMenuMeta(update) {
      return patchMenuMetaWithCompatibility(update);
    },
    async patchMenuMetaForMenu(menuId, update) {
      return patchMenuMetaForMenuWithCompatibility(menuId, update);
    },
    async patchMenuDraftState(snapshot, savedAt) {
      return patchMenuDraftState(snapshot, savedAt);
    },
    finalizePersistStatus(ok) {
      finalizePersistStatus(ok);
    },
    commitDraft(ts) {
      _dirty = false;
      setSharedDraftState(ts);
      updateManagerActionBar();
    },
    clearDraft() {
      clearDraftSaveOnlyChanges();
      clearSharedDraftState();
      clearCurrentLocalDraft();
      updateManagerActionBar();
    },
    commitLiveSave(ts) {
      menuState._meta = { ...(menuState._meta || {}), lastUpdatedTs: String(ts) };
      lsSet(LS_KEYS.lastUpdated, String(ts));
      clearDraftSaveOnlyChanges();
      clearSharedDraftState();
      clearCurrentLocalDraft();
      updateManagerActionBar();
      updateLastUpdatedLabel();
    },
    buildPreview(snapshot) {
      return buildMenuSessionPreview(snapshot);
    },
    getMenuId() {
      return MENU_ID;
    },
    getRestaurantId() {
      return RESTAURANT_ID;
    },
    getMenuName() {
      return _activeMenuName;
    },
    snapshotCurrentItemsAsLastSent() {
      return snapshotCurrentItemsAsLastSent();
    },
    getCurrentFeaturedIds() {
      return getCurrentFeaturedIds();
    },
    canEditRestaurantSpecials(restaurantId) {
      return currentUserCanEditRestaurantSpecials(restaurantId);
    },
    getRestaurantMenuIds(restaurantId) {
      return getRestaurantSpecialConfig(restaurantId)?.menuIds || [];
    },
    async dispatchNotification(payload) {
      return sendMenuNotificationThroughApi(payload);
    },
    collectNotificationWarnings(summary) {
      return summarizeNotificationWarnings(summary);
    },
    syncLocalCache(options = {}) {
      return syncLocalMenuCache(options);
    },
    commitPublished({ diff, ts, featuredIds }) {
      _lastSentFeaturedIds = new Set(featuredIds);
      applySentState(diff, ts);
      clearDraftSaveOnlyChanges();
      clearSharedDraftState();
      clearCurrentLocalDraft();
      updateManagerActionBar();
      updateLastUpdatedLabel();
    },
    dedupeWarnings(warnings = []) {
      return dedupeWarningMessages(warnings);
    },
  };
}
```

Delete the old inline `createLegacyMenuPublishService()` block from `app.js` once the shared module behavior matches it. The key rule is that `getMenuSessionPorts()` may keep low-level browser hooks like persistence, notification, cache sync, and featured sync, but it must stop owning high-level publish policy or branching.

- [ ] **Step 4: Extend the publish boundary tests to lock the new end-state**

```js
test('app createMenuSessionLifecycle is only a delegation wrapper after publish deepening', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', '..', 'app.js'),
    'utf8'
  );
  const start = source.indexOf('function createMenuSessionLifecycle(');
  const end = source.indexOf('function ensureCurrentMenuSession(', start);
  const fnSource = source.slice(start, end);

  assert.match(fnSource, /boundary\\.createMenuSessionLifecycle/);
  assert.doesNotMatch(fnSource, /async open\\(/);
  assert.doesNotMatch(fnSource, /async refresh\\(/);
  assert.doesNotMatch(fnSource, /preview\\(\\)/);
});
```

- [ ] **Step 5: Run the publish-focused test slice**

Run: `node --test tests/boundaries/publish.boundary.test.cjs tests/phase2-session-boundaries.test.cjs`

Expected: PASS, with the session lifecycle and publish service behavior coming from `core/session/*`, not shadow code in `app.js`.

- [ ] **Step 6: Commit the publish/session slice**

```bash
git add core/session/publish-service.js core/session/menu-session.js app.js tests/boundaries/publish.boundary.test.cjs tests/phase2-session-boundaries.test.cjs
git commit -m "refactor: move session publish runtime behind shared modules"
```

### Task 3: Deepen `core/data/menu-state-loader.js` and keep specials outside the slice

**Files:**
- Modify: `core/data/menu-state-loader.js:1-220`
- Modify: `app.js:6408-6670`
- Modify: `tests/boundaries/session.boundary.test.cjs:92-286`
- Modify: `tests/phase2-session-boundaries.test.cjs:6-125`
- Test: `tests/boundaries/session.boundary.test.cjs`
- Test: `tests/phase2-session-boundaries.test.cjs`

- [ ] **Step 1: Add the missing dependencies to `core/data/menu-state-loader.js` so it can reach parity with the richer app-owned implementation**

```js
const applyPersistedDraftState = typeof deps.applyPersistedDraftState === 'function'
  ? deps.applyPersistedDraftState
  : (draftState => globalScope.applyPersistedDraftState?.(draftState));
const getServerLiveSnapshot = typeof deps.getServerLiveSnapshot === 'function'
  ? deps.getServerLiveSnapshot
  : (() => globalScope.getServerLiveSnapshot?.());
const setLocalDraftBaseSnapshot = typeof deps.setLocalDraftBaseSnapshot === 'function'
  ? deps.setLocalDraftBaseSnapshot
  : (snapshot => globalScope.setLocalDraftBaseSnapshot?.(snapshot));
const setWorkspaceRestaurantToolsReadable = typeof deps.setWorkspaceRestaurantToolsReadable === 'function'
  ? deps.setWorkspaceRestaurantToolsReadable
  : (value => {
      if (typeof globalScope.setWorkspaceRestaurantToolsReadable === 'function') {
        globalScope.setWorkspaceRestaurantToolsReadable(value);
      } else {
        globalScope._workspaceRestaurantToolsReadable = !!value;
      }
    });
```

- [ ] **Step 2: Replace the inline `app.js` loader body with a thin dependency adapter**

```js
function createMenuStateLoaderService(deps = {}) {
  const boundary = getSessionModuleBoundary();
  if (typeof boundary?.createMenuStateLoaderService !== 'function') {
    throw new Error('createMenuStateLoaderService boundary is unavailable');
  }

  return boundary.createMenuStateLoaderService({
    readState: deps.readState || (async ({ request } = {}) => {
      return readMenuStateThroughApi(request || buildCurrentMenuPageRequest());
    }),
    hydrateFromState: deps.hydrateFromState || hydrateState,
    applyPersistedDraftState: deps.applyPersistedDraftState || applyPersistedDraftState,
    setDefaultState: deps.setDefaultState || (() => {
      menuState = defaultState();
      currentDesign = { ...DESIGN_DEFAULTS };
      _restaurantCustomDesignEnabled = true;
    }),
    setDirty: deps.setDirty || (value => { _dirty = !!value; }),
    clearDraftChanges: deps.clearDraftChanges || (() => {
      clearDraftSaveOnlyChanges();
      clearSharedDraftState();
      clearCurrentLocalDraft({ clearStorage: false });
    }),
    writeMenuCache: deps.writeMenuCache || (data => lsSet(LS_KEYS.menuCache, JSON.stringify(data))),
    refreshFeatured: deps.refreshFeatured || refreshFeaturedForActiveMenu,
    buildSnapshot: deps.buildSnapshot || (source => buildMenuSessionSnapshot(source)),
    getLastUpdatedTs: deps.getLastUpdatedTs || (() => menuState._meta?.lastUpdatedTs),
    getCategorySnapshot: deps.getCategorySnapshot || (() => getCategoryStateSnapshot()),
    getDesignSnapshot: deps.getDesignSnapshot || (() => getDesignSnapshot()),
    getFeaturedSnapshot: deps.getFeaturedSnapshot || (() => getFeaturedSnapshot()),
    syncLocalDraftDirtyState: deps.syncLocalDraftDirtyState || (() => syncLocalDraftDirtyState()),
    isDirty: deps.isDirty || (() => !!_dirty),
    readStoredLocalDraftEnvelope: deps.readStoredLocalDraftEnvelope || (() => readStoredLocalDraftEnvelope()),
    alignLocalDraftEnvelope: deps.alignLocalDraftEnvelope || ((envelope, liveSnapshot = getServerLiveSnapshot()) => (
      alignLocalDraftEnvelopeWithLiveSnapshot(envelope, liveSnapshot)
    )),
    buildCurrentLocalDraftEnvelope: deps.buildCurrentLocalDraftEnvelope || (() => buildCurrentLocalDraftEnvelope()),
    applyLocalDraftEnvelope: deps.applyLocalDraftEnvelope || ((envelope, options = {}) => applyLocalDraftEnvelope(envelope, options)),
    clearCurrentLocalDraft: deps.clearCurrentLocalDraft || ((options = {}) => clearCurrentLocalDraft(options)),
    applyWorkspaceRestaurantTools: deps.applyWorkspaceRestaurantTools || (data => applyWorkspaceRestaurantTools(data)),
    syncServerLiveSnapshot: deps.syncServerLiveSnapshot || (() => syncServerLiveSnapshot()),
    getServerLiveSnapshot: deps.getServerLiveSnapshot || (() => getServerLiveSnapshot()),
    setLocalDraftBaseSnapshot: deps.setLocalDraftBaseSnapshot || (snapshot => setLocalDraftBaseSnapshot(snapshot)),
    setWorkspaceRestaurantToolsReadable: deps.setWorkspaceRestaurantToolsReadable || (value => { _workspaceRestaurantToolsReadable = !!value; }),
  });
}

async function _loadActiveMenuStateInternal(options = {}) {
  return createMenuStateLoaderService().load(options);
}

async function _pollActiveMenuStateInternal(options = {}) {
  return createMenuStateLoaderService().poll(options);
}
```

- [ ] **Step 3: Keep `createRestaurantSpecialsService()` out of the refactor and lock that choice in the plan**

```js
// Do not move this service in the session/data runtime split.
// The loader only depends on refreshFeaturedForActiveMenu(), not on the specials CRUD boundary.
function getRestaurantSpecialsService() {
  if (_restaurantSpecialsService) return _restaurantSpecialsService;
  _restaurantSpecialsService = createRestaurantSpecialsService();
  return _restaurantSpecialsService;
}

async function refreshFeaturedForActiveMenu() {
  return getRestaurantSpecialsService().refreshForActiveMenu(RESTAURANT_ID);
}
```

- [ ] **Step 4: Update the session boundary tests to reflect the deeper loader**

```js
test('app createMenuStateLoaderService delegates without carrying inline load or poll logic', () => {
  const source = readSource('../app.js');
  const start = source.indexOf('function createMenuStateLoaderService(');
  const end = source.indexOf('async function _loadActiveMenuStateInternal(', start);
  const fnSource = source.slice(start, end);

  assert.match(fnSource, /boundary\\.createMenuStateLoaderService/);
  assert.doesNotMatch(fnSource, /async load\\(/);
  assert.doesNotMatch(fnSource, /async poll\\(/);
});
```

- [ ] **Step 5: Run the loader-focused tests**

Run: `node --test tests/boundaries/session.boundary.test.cjs tests/phase2-session-boundaries.test.cjs`

Expected: PASS, including the new poll/featured-refresh regression and the app thin-wrapper guardrail.

- [ ] **Step 6: Commit the loader slice**

```bash
git add core/data/menu-state-loader.js app.js tests/boundaries/session.boundary.test.cjs tests/phase2-session-boundaries.test.cjs
git commit -m "refactor: move menu state loading behind shared data module"
```

### Task 4: Move polling start/stop into `core/session/poll-scheduler.js`

**Files:**
- Modify: `core/session/poll-scheduler.js:1-92`
- Modify: `app.js:8563-8714`
- Modify: `tests/phase2-session-boundaries.test.cjs:6-125`
- Test: `tests/phase2-session-boundaries.test.cjs`

- [ ] **Step 1: Add a new poll-controller boundary to `core/session/poll-scheduler.js`**

```js
function createMenuPollControllerImpl(config = {}, runtime = {}) {
  const schedulerFactory = typeof config.schedulerFactory === 'function'
    ? config.schedulerFactory
    : (schedulerConfig => createMenuPollScheduler(schedulerConfig));
  const scheduler = schedulerFactory(config.schedulerConfig || {});
  const documentRef = runtime.document || globalScope.document;
  const schedule = runtime.schedule || ((fn, ms) => globalScope.setInterval(fn, ms));
  const unschedule = runtime.unschedule || (id => globalScope.clearInterval(id));
  const intervalMs = Number(config.intervalMs || 10000);
  const shouldPoll = typeof config.shouldPoll === 'function' ? config.shouldPoll : (() => true);
  let intervalId = null;
  let visibilityHandler = null;

  function clearIntervalHandle() {
    if (intervalId) {
      unschedule(intervalId);
      intervalId = null;
    }
  }

  function startInterval() {
    clearIntervalHandle();
    intervalId = schedule(() => {
      if (!shouldPoll()) return;
      scheduler.tick();
    }, intervalMs);
  }

  function stop() {
    clearIntervalHandle();
    if (visibilityHandler && documentRef) {
      documentRef.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    scheduler.reset?.();
  }

  function start() {
    stop();
    if (!documentRef) return;
    if (documentRef.visibilityState === 'visible') startInterval();
    visibilityHandler = () => {
      if (documentRef.visibilityState === 'visible') {
        scheduler.resume();
        startInterval();
      } else {
        clearIntervalHandle();
      }
    };
    documentRef.addEventListener('visibilitychange', visibilityHandler);
  }

  return {
    start,
    stop,
    scheduler,
  };
}

modules.createMenuPollController = function createMenuPollControllerBoundary(config = {}, options = {}) {
  if (options && typeof options.impl === 'function') {
    return options.impl(config, options);
  }
  return createMenuPollControllerImpl(config, options);
};
```

- [ ] **Step 2: Replace the app-owned polling body with a thin wrapper**

```js
function getMenuPollController() {
  if (_menuPollController) return _menuPollController;
  const boundary = getSessionModuleBoundary();
  if (typeof boundary?.createMenuPollController !== 'function') {
    throw new Error('createMenuPollController boundary is unavailable');
  }

  _menuPollController = boundary.createMenuPollController({
    schedulerConfig: {
      loader: async ({ requestContext }) => {
        const [menuId, menuType, restaurantId] = requestContext.split('|');
        return ensureCurrentMenuSession({
          requestedMenuId: menuId,
          requestedMenuSlug: getMenuById(menuId)?.slug || '',
          siteRestaurantId: restaurantId || '',
        }).refresh({
          reason: 'poll',
          requestedMenuId: menuId,
          source: 'poll',
          expectedMenuType: menuType,
        });
      },
      onResult: async result => {
        if (result?.changed) await renderPublicViews();
        if (result?.designChanged) applyDesign(currentDesign);
        return handlePollSuccess(result);
      },
      onError: () => {
        handlePollError();
      },
      getContextKey: () => (MENU_ID ? `${MENU_ID}|${MENU_TYPE}|${RESTAURANT_ID || ''}` : ''),
    },
    intervalMs: 10000,
    shouldPoll: () => !(isManagerMode || isAdminMode),
  }, {
    document,
    schedule: (fn, ms) => setInterval(fn, ms),
    unschedule: handle => clearInterval(handle),
  });

  return _menuPollController;
}

function startPolling() {
  if (!SUPABASE_URL || !MENU_ID) return;
  getMenuPollController().start();
}

function stopPolling() {
  _menuPollController?.stop?.();
}
```

- [ ] **Step 3: Add a phase-2 test that locks the new poll-controller boundary**

```js
test('session/data module scripts register a poll controller boundary', () => {
  const sandbox = loadSandboxWithScripts([
    'core/session/poll-scheduler.js',
  ]);

  assert.equal(typeof sandbox.__HF_SESSION_MODULES__.createMenuPollController, 'function');
});
```

- [ ] **Step 4: Run the polling-focused guardrails**

Run: `node --test tests/phase2-session-boundaries.test.cjs --test-name-pattern "poll controller|runtime split"`

Expected: PASS, proving polling interval and visibility wiring moved out of `app.js`.

- [ ] **Step 5: Commit the polling slice**

```bash
git add core/session/poll-scheduler.js app.js tests/phase2-session-boundaries.test.cjs
git commit -m "refactor: move poll control behind shared session module"
```

### Task 5: Collapse the remaining `app.js` action-state helpers into compatibility wrappers

**Files:**
- Modify: `app.js:1255-1337`
- Modify: `tests/architecture-boundaries.test.cjs:618-770`
- Test: `tests/architecture-boundaries.test.cjs`
- Test: `tests/phase2-session-boundaries.test.cjs`

- [ ] **Step 1: Replace `getMenuActionState()` and `updateSaveBtn()` with wrappers over existing boundaries**

```js
function getMenuActionState({ isCompactViewport = false } = {}) {
  return createDraftLedgerService().getActionBarState({ isCompactViewport });
}

function updateSaveBtn() {
  return updateManagerActionBar();
}
```

- [ ] **Step 2: Keep the existing architecture-level action-bar assertions, but point them at the draft-ledger boundary rather than duplicate app logic**

```js
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
  assert.equal(summary.textContent, 'No pending changes');
  assert.equal(saveBtn.disabled, true);
  assert.equal(sendBtn.disabled, true);
});
```

- [ ] **Step 3: Run the action-bar verification slice**

Run: `node --test tests/architecture-boundaries.test.cjs tests/phase2-session-boundaries.test.cjs --test-name-pattern "draft ledger service|manager action bar|legacy action-button helpers"`

Expected: PASS, confirming the UI still shows the same copy and button states while `app.js` no longer owns the logic.

- [ ] **Step 4: Commit the wrapper cleanup**

```bash
git add app.js tests/architecture-boundaries.test.cjs tests/phase2-session-boundaries.test.cjs
git commit -m "refactor: collapse app action helpers to shared boundaries"
```

### Task 6: Final verification and cleanup pass

**Files:**
- Modify: `app.js`
- Modify: `core/session/menu-session.js`
- Modify: `core/session/publish-service.js`
- Modify: `core/data/menu-state-loader.js`
- Modify: `core/session/poll-scheduler.js`
- Modify: `tests/boundaries/session.boundary.test.cjs`
- Modify: `tests/boundaries/publish.boundary.test.cjs`
- Modify: `tests/phase2-session-boundaries.test.cjs`
- Modify: `tests/architecture-boundaries.test.cjs`
- Test: `tests/boundaries/session.boundary.test.cjs`
- Test: `tests/boundaries/publish.boundary.test.cjs`
- Test: `tests/phase2-session-boundaries.test.cjs`
- Test: `tests/architecture-boundaries.test.cjs`

- [ ] **Step 1: Remove dead `app.js` helpers and confirm there is no remaining session/data shadow implementation**

```js
// Delete these app-owned bodies after the shared-module implementations are live:
// - createLegacyMenuPublishService()
// - the inline body previously inside createMenuSessionLifecycle()
// - the inline body previously inside createMenuStateLoaderService()
// - the inline body previously inside createMenuPollScheduler()
//
// Keep only:
// - getMenuSessionPorts()
// - createMenuPublishService()
// - createMenuSessionLifecycle()
// - ensureCurrentMenuSession()
// - createMenuStateLoaderService()
// - loadActiveMenuState()
// - getMenuPollController()
// - startPolling()
// - stopPolling()
// - compatibility wrappers for getMenuActionState() / updateSaveBtn()
```

- [ ] **Step 2: Run the full targeted verification suite**

Run: `node --test tests/boundaries/session.boundary.test.cjs tests/boundaries/publish.boundary.test.cjs tests/phase2-session-boundaries.test.cjs tests/architecture-boundaries.test.cjs`

Expected: PASS, with boundary tests covering route-first fallback, quiet save vs send-update, draft reload/reapply, featured refresh, polling, and action-bar compatibility.

- [ ] **Step 3: Run syntax verification**

Run: `node --check app.js`

Expected: no output and exit code `0`.

- [ ] **Step 4: Commit the finished slice**

```bash
git add app.js core/session/menu-session.js core/session/publish-service.js core/data/menu-state-loader.js core/session/poll-scheduler.js tests/boundaries/session.boundary.test.cjs tests/boundaries/publish.boundary.test.cjs tests/phase2-session-boundaries.test.cjs tests/architecture-boundaries.test.cjs
git commit -m "refactor: split app session and data runtime into shared modules"
```

## Self-Review

**1. Spec coverage**

- `getMenuActionState()` / `updateSaveBtn()` are handled in Task 5 as compatibility wrappers over the existing draft-ledger and manager-workspace boundaries.
- `getMenuSessionPorts()`, `createMenuSessionLifecycle()`, and `ensureCurrentMenuSession()` are covered in Task 2.
- `createMenuStateLoaderService()`, `loadActiveMenuState()`, and draft/state loading behavior are covered in Task 3.
- `createMenuPollScheduler()`, `startPolling()`, and `stopPolling()` are covered in Task 4 via the new `createMenuPollController` boundary.
- Quiet save vs send-update behavior, draft handling, and publish entrypoints are covered in Task 2.
- Featured/specials refresh behavior is preserved in Task 3, while `createRestaurantSpecialsService()` is intentionally kept out of scope except for `refreshFeaturedForActiveMenu()`.
- Existing boundary tests are extended in Tasks 1, 2, 3, and 5, then re-run in Task 6.

**2. Placeholder scan**

- Checked for `TODO`, `TBD`, `implement later`, `appropriate error handling`, and `similar to Task`.
- No placeholders remain.

**3. Type consistency**

- The plan consistently uses `createMenuSessionLifecycle`, `createMenuPublishService`, `createMenuStateLoaderService`, `createMenuPollController`, `preparePublish`, `commitPublish`, `saveDraft`, `publishUpdate`, `getActionBarState`, and `updateManagerActionBar`.
- The new polling boundary is always named `createMenuPollController`.
- The compatibility wrappers always point to `createDraftLedgerService().getActionBarState()` and `updateManagerActionBar()`.

Plan complete and saved to `docs/superpowers/plans/2026-04-21-appjs-session-data-runtime-split.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
