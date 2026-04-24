# App.js Landing Runtime Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the landing-page runtime out of `app.js` into deep owned modules so `app.js` becomes an orchestrator while the landing admin flow, selective publish behavior, and landing-root fallback behavior stay unchanged.

**Architecture:** Introduce a dedicated `core/landing/*` runtime that mirrors the repo's existing extracted-module pattern: one model boundary for landing records and derived behavior, one state/data boundary for in-memory runtime state and API persistence, one admin workspace boundary, and one public-root renderer boundary. Keep every current global function name that tests and inline HTML handlers already call, but make those globals in `app.js` thin wrappers over the landing services instead of owning the implementation.

**Tech Stack:** Plain browser JavaScript, shared runtime scripts loaded by HTML `<script>` tags, Node test runner (`node --test`), no bundler, no dependencies.

---

## File Structure

- `app.js`
  Keep landing orchestration only: instantiate landing services, expose the existing global function names as thin wrappers, and stop carrying the landing implementation body.
- `core/landing/model.js`
  Own landing defaults, normalization, validation, section diffing, publish copying, hours status derivation, renderable item filtering, and small HTML helpers used by both admin and public landing UI.
- `core/landing/store.js`
  Own in-memory landing runtime state: current record, dirty flag, load promise/error, active admin panel, filters, and review carousel index.
- `core/landing/data-service.js`
  Own landing fetch/save/publish persistence against `/api/public` and `/api/admin`, layered on top of the store and model.
- `core/landing/admin-workspace.js`
  Own `renderLandingAdminWorkspace()`, overview/hours/events/news/reviews panel rendering, field mutation handlers, import helpers, draft save flow, publish modal flow, and admin toolbar refresh behavior.
- `core/landing/root-renderer.js`
  Own `renderLandingRootPage()`, root fallback visibility, root hours/events/news/reviews rendering, and review carousel controls.
- `index.html`
  Load the new landing runtime scripts before `/app.js` so the shared landing module registry exists on the shared root page.
- `manager/index.html`
  Load the same landing runtime scripts before `/app.js` because the shared runtime still boots through the common shell even though manager does not render the landing workspace.
- `admin/index.html`
  Load the landing runtime scripts before `/app.js` so the admin landing workspace wrappers resolve immediately.
- `leroyslounge/index.html`
  Load the landing runtime scripts before `/app.js` to keep shared runtime ordering consistent on route-owned pages.
- `elroyscantina/index.html`
  Load the landing runtime scripts before `/app.js` to keep shared runtime ordering consistent on route-owned pages.
- `scripts/check-html-script-order.cjs`
  Extend the shared runtime script-order guardrail with the new `core/landing/*` files.
- `tests/helpers/runtime.cjs`
  Extend the test runtime script list so landing module files load before `app.js` in sandboxed tests.
- `tests/runtime-helpers.test.cjs`
  Update script-order expectations to include the new landing runtime files.
- `tests/boundaries/landing.boundary.test.cjs`
  Add a dedicated landing boundary suite for module registration and app-level delegation.
- `tests/landing-page-hours.test.cjs`
  Keep the current hours behavior coverage passing through the existing global function names after those names delegate into `core/landing/*`.
- `tests/landing-page-content.test.cjs`
  Keep the current content, fallback, and review-pair coverage passing through the existing global function names after those names delegate into `core/landing/*`.

### Task 1: Lock The Landing Boundary And Script Order In Tests

**Files:**
- Create: `core/landing/model.js`
- Create: `core/landing/store.js`
- Create: `core/landing/data-service.js`
- Create: `core/landing/admin-workspace.js`
- Create: `core/landing/root-renderer.js`
- Create: `tests/boundaries/landing.boundary.test.cjs`
- Modify: `tests/helpers/runtime.cjs`
- Modify: `tests/runtime-helpers.test.cjs`
- Test: `tests/boundaries/landing.boundary.test.cjs`
- Test: `tests/runtime-helpers.test.cjs`

- [ ] **Step 1: Add failing boundary coverage for the landing module registry**

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const { loadSandboxWithScripts } = require('../helpers/runtime.cjs');

test('landing runtime scripts register landing factories', () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/model.js',
    'core/landing/store.js',
    'core/landing/data-service.js',
    'core/landing/admin-workspace.js',
    'core/landing/root-renderer.js',
  ]);

  assert.equal(typeof sandbox.__HF_LANDING_MODULES__, 'object');
  assert.equal(typeof sandbox.__HF_LANDING_MODULES__.createLandingModel, 'function');
  assert.equal(typeof sandbox.__HF_LANDING_MODULES__.createLandingStore, 'function');
  assert.equal(typeof sandbox.__HF_LANDING_MODULES__.createLandingDataService, 'function');
  assert.equal(typeof sandbox.__HF_LANDING_MODULES__.createLandingAdminWorkspaceService, 'function');
  assert.equal(typeof sandbox.__HF_LANDING_MODULES__.createLandingRootRendererService, 'function');
});
```

- [ ] **Step 2: Update the runtime helper expectations so the test harness demands the landing scripts**

```js
const DEFAULT_RUNTIME_SCRIPTS = [
  'core/domain/constants.js',
  'core/domain/category-defaults.js',
  'core/auth/auth-api.js',
  'core/auth/auth-session-service.js',
  'core/auth/auth-overlay-template.js',
  'core/auth/auth-overlay-controller.js',
  'core/ui/manager/workspace.js',
  'core/ui/manager/sections.js',
  'core/ui/manager/editors.js',
  'core/ui/manager/open-food-facts.js',
  'core/ui/manager/untappd.js',
  'core/ui/manager/barcode-scanner.js',
  'core/ui/admin/workspace.js',
  'core/ui/admin/switcher.js',
  'core/ui/public/footer-actions.js',
  'core/ui/public/renderer-default.js',
  'core/session/menu-publish-workflow.js',
  'core/session/menu-publish-facade.js',
  'core/session/publish-service.js',
  'core/session/menu-session.js',
  'core/data/menu-state-loader.js',
  'core/session/poll-scheduler.js',
  'core/landing/model.js',
  'core/landing/store.js',
  'core/landing/data-service.js',
  'core/landing/admin-workspace.js',
  'core/landing/root-renderer.js',
  'routes/shared/public-route-core.js',
  'app.js',
];
```

```js
test('loadSandboxWithScripts evaluates runtime files in explicit order', () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/model.js',
    'core/landing/store.js',
    'core/landing/data-service.js',
    'core/landing/root-renderer.js',
    'app.js',
    'routes/shared/public-route-core.js',
    'leroyslounge/app.js',
  ]);
  const restaurantId = getState(sandbox, 'window.__publicRouteRenderer?.restaurantId || ""');
  assert.equal(restaurantId, '00000000-0000-0000-0000-000000000010');
});
```

- [ ] **Step 3: Run the targeted tests to verify they fail before the new landing runtime exists**

Run: `node --test tests/boundaries/landing.boundary.test.cjs tests/runtime-helpers.test.cjs`
Expected: FAIL because `core/landing/*.js` files do not exist yet and `app.js` has no landing-module delegation path.

- [ ] **Step 4: Create minimal stub landing modules so the registry and script-order tests go green**

```js
// core/landing/model.js
(function bootstrapLandingModelModule(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};
  modules.createLandingModel = function createLandingModelBoundary() {
    return {};
  };
  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// core/landing/store.js
(function bootstrapLandingStoreModule(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};
  modules.createLandingStore = function createLandingStoreBoundary() {
    return {};
  };
  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// core/landing/data-service.js
(function bootstrapLandingDataServiceModule(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};
  modules.createLandingDataService = function createLandingDataServiceBoundary() {
    return {};
  };
  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// core/landing/admin-workspace.js
(function bootstrapLandingAdminWorkspaceModule(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};
  modules.createLandingAdminWorkspaceService = function createLandingAdminWorkspaceServiceBoundary() {
    return {};
  };
  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// core/landing/root-renderer.js
(function bootstrapLandingRootRendererModule(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};
  modules.createLandingRootRendererService = function createLandingRootRendererServiceBoundary() {
    return {};
  };
  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 5: Run the bootstrap tests and commit the registry/script-order slice**

Run: `node --test tests/boundaries/landing.boundary.test.cjs tests/runtime-helpers.test.cjs`
Expected: PASS

```bash
git add core/landing/model.js core/landing/store.js core/landing/data-service.js core/landing/admin-workspace.js core/landing/root-renderer.js tests/boundaries/landing.boundary.test.cjs tests/helpers/runtime.cjs tests/runtime-helpers.test.cjs
git commit -m "test: bootstrap landing runtime boundary"
```

### Task 2: Extract The Landing Model Boundary

**Files:**
- Create: `core/landing/model.js`
- Modify: `app.js`
- Test: `tests/landing-page-hours.test.cjs`
- Test: `tests/landing-page-content.test.cjs`
- Test: `tests/boundaries/landing.boundary.test.cjs`

- [ ] **Step 1: Add a failing model-factory test that exercises the shared landing behavior without `app.js`**

```js
test('landing model factory owns record defaults, normalization, validation, and selective publish', () => {
  const sandbox = loadSandboxWithScripts(['core/landing/model.js']);
  const model = sandbox.__HF_LANDING_MODULES__.createLandingModel({
    restaurants: [
      { id: 'leroys', name: "Leroy's Lounge" },
      { id: 'elroys', name: "El Roy's Cantina" },
    ],
    restaurantTimeZone: 'America/Detroit',
    uid: () => 'generated-id',
    cloneJsonCompatible: value => JSON.parse(JSON.stringify(value)),
    escHtml: value => String(value),
    escAttrJs: value => JSON.stringify(String(value)),
    formatUpdatedAt: value => String(value),
  });

  const record = model.createDefaultRecord();
  record.draftContent.news.items.push({
    id: 'news-1',
    target: 'both',
    title: 'Draft story',
    href: 'https://example.com/story',
    source: 'Chronicle',
    publishedDate: '2026-04-01',
    body: 'Draft copy',
    archived: false,
    archivedAt: '',
    updatedAt: '10',
    importMeta: { sourceUrl: 'https://example.com/story', lastAttemptTs: '10', lastSuccessTs: '10', status: 'imported', messages: [] },
  });

  const published = model.applySectionPublish(record, ['news']);

  assert.equal(record.liveContent.news.items.length, 0);
  assert.equal(published.liveContent.news.items.length, 1);
  assert.equal(model.validateNewsSection(published.liveContent.news).valid, true);
});
```

- [ ] **Step 2: Run the model and landing behavior tests to verify they fail first**

Run: `node --test tests/boundaries/landing.boundary.test.cjs tests/landing-page-hours.test.cjs tests/landing-page-content.test.cjs`
Expected: FAIL because `createLandingModel()` is only a stub from Task 1 and does not yet implement landing defaults, normalization, validation, or selective publish behavior.

- [ ] **Step 3: Implement `core/landing/model.js` as the deep landing record/model boundary**

```js
(function bootstrapLandingModelModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};

  function createLandingModelImpl(deps = {}) {
    const restaurants = Array.isArray(deps.restaurants) ? deps.restaurants.slice() : [];
    const restaurantTimeZone = deps.restaurantTimeZone || 'America/Detroit';
    const uid = typeof deps.uid === 'function' ? deps.uid : (() => `landing-${Date.now()}`);
    const cloneJsonCompatible = typeof deps.cloneJsonCompatible === 'function'
      ? deps.cloneJsonCompatible
      : (value => JSON.parse(JSON.stringify(value)));
    const escHtml = typeof deps.escHtml === 'function' ? deps.escHtml : (value => String(value));
    const escAttrJs = typeof deps.escAttrJs === 'function' ? deps.escAttrJs : (value => JSON.stringify(String(value)));
    const formatUpdatedAt = typeof deps.formatUpdatedAt === 'function' ? deps.formatUpdatedAt : (value => String(value || ''));

    const STATE_ID = 'root';
    const SECTION_ORDER = ['overview', 'hours', 'events', 'news', 'reviews'];
    const SECTION_LABELS = { overview: 'Overview', hours: 'Hours', events: 'Events', news: 'News', reviews: 'Reviews' };
    const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
    const TARGET_BOTH = 'both';

    function createDefaultDay() { return { closed: true, open: '', close: '' }; }
    function createDefaultHoursRestaurant() {
      const days = {};
      DAY_ORDER.forEach(dayKey => { days[dayKey] = createDefaultDay(); });
      return { days };
    }
    function createDefaultImportMeta(sourceUrl = '') {
      return { sourceUrl: sourceUrl ? String(sourceUrl) : '', lastAttemptTs: '', lastSuccessTs: '', status: 'idle', messages: [] };
    }
    function createDefaultEventItem() {
      return { id: uid(), target: TARGET_BOTH, title: '', eventDate: '', startTime: '', endTime: '', timingNote: '', body: '', archived: false, archivedAt: '', updatedAt: '' };
    }
    function createDefaultNewsItem() {
      return { id: uid(), target: TARGET_BOTH, title: '', body: '', href: '', source: '', publishedDate: '', imageUrl: '', archived: false, archivedAt: '', updatedAt: '', importMeta: createDefaultImportMeta() };
    }
    function createDefaultReviewItem() {
      return { id: uid(), href: '', author: '', quote: '', source: 'Google Review', rating: '', archived: false, archivedAt: '', updatedAt: '', importMeta: createDefaultImportMeta() };
    }
    function createDefaultContent() {
      const hoursRestaurants = {};
      const reviewRestaurants = {};
      restaurants.forEach(restaurant => {
        hoursRestaurants[restaurant.id] = createDefaultHoursRestaurant();
        reviewRestaurants[restaurant.id] = [];
      });
      return { overview: {}, hours: { restaurants: hoursRestaurants }, events: { items: [] }, news: { items: [] }, reviews: { restaurants: reviewRestaurants } };
    }
    function createDefaultRecord() {
      const content = createDefaultContent();
      return { id: STATE_ID, draftContent: cloneJsonCompatible(content), liveContent: cloneJsonCompatible(content), draftSavedTs: '', livePublishedTs: '' };
    }

    function normalizeRecord(rawRecord = {}) {
      const defaults = createDefaultRecord();
      return {
        id: rawRecord?.id ? String(rawRecord.id) : defaults.id,
        draftContent: normalizeContent(rawRecord?.draft_content || rawRecord?.draftContent || defaults.draftContent),
        liveContent: normalizeContent(rawRecord?.live_content || rawRecord?.liveContent || defaults.liveContent),
        draftSavedTs: normalizeTimestamp(rawRecord?.draft_saved_ts || rawRecord?.draftSavedTs),
        livePublishedTs: normalizeTimestamp(rawRecord?.live_published_ts || rawRecord?.livePublishedTs),
      };
    }

    function applySectionPublish(record = createDefaultRecord(), sectionIds = []) {
      const nextRecord = normalizeRecord(record);
      const draftContent = cloneJsonCompatible(nextRecord.draftContent);
      const liveContent = cloneJsonCompatible(nextRecord.liveContent);
      sectionIds.filter(sectionId => SECTION_ORDER.includes(sectionId)).forEach(sectionId => {
        liveContent[sectionId] = cloneJsonCompatible(draftContent[sectionId]);
      });
      nextRecord.liveContent = normalizeContent(liveContent);
      return nextRecord;
    }

    return {
      createDefaultRecord,
      createDefaultEventItem,
      createDefaultNewsItem,
      createDefaultReviewItem,
      normalizeRecord,
      normalizeTarget,
      normalizeImportMeta,
      normalizeTimeValue,
      validateHoursSection,
      validateEventsSection,
      validateNewsSection,
      validateReviewsSection,
      getSectionValidation,
      getDraftDiffSectionIds,
      landingSectionHasDiff,
      applySectionPublish,
      computeRestaurantStatus,
      getRenderableEvents,
      getRenderableNews,
      getRenderableReviews,
      buildReviewPairs,
      renderHoursRowsHtml,
      renderTargetOptionsHtml,
      renderRatingOptionsHtml,
      formatLandingTimestampLabel(value) {
        const ts = Number(value || 0);
        return ts ? formatUpdatedAt(ts) : 'Not yet';
      },
      getConstants() {
        return { STATE_ID, SECTION_ORDER, SECTION_LABELS, DAY_ORDER, DAY_LABELS, TARGET_BOTH, restaurantTimeZone };
      },
      _private: { createDefaultContent, createDefaultHoursRestaurant, createDefaultDay, createDefaultImportMeta, normalizeContent, normalizeTimestamp },
    };
  }

  modules.createLandingModel = function createLandingModelBoundary(deps = {}) {
    return createLandingModelImpl(deps);
  };

  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

```js
// app.js: instantiate the model once and keep the old function names as thin proxies
const LANDING_MODULES = (globalThis.__HF_LANDING_MODULES__ && typeof globalThis.__HF_LANDING_MODULES__ === 'object')
  ? globalThis.__HF_LANDING_MODULES__
  : {};
const landingModel = typeof LANDING_MODULES.createLandingModel === 'function'
  ? LANDING_MODULES.createLandingModel({
      restaurants: knownLandingRestaurants(),
      restaurantTimeZone: RESTAURANT_TIME_ZONE,
      uid,
      cloneJsonCompatible,
      escHtml,
      escAttrJs,
      formatUpdatedAt,
    })
  : null;

function createDefaultLandingPageRecord() { return landingModel.createDefaultRecord(); }
function normalizeLandingPageRecord(rawRecord = {}) { return landingModel.normalizeRecord(rawRecord); }
function normalizeLandingTarget(value = '', options = {}) { return landingModel.normalizeTarget(value, options); }
function normalizeLandingImportMeta(rawMeta = {}) { return landingModel.normalizeImportMeta(rawMeta); }
function normalizeLandingTimeValue(value = '') { return landingModel.normalizeTimeValue(value); }
function validateLandingHoursSection(section = {}) { return landingModel.validateHoursSection(section); }
function validateLandingEventsSection(section = {}) { return landingModel.validateEventsSection(section); }
function validateLandingNewsSection(section = {}) { return landingModel.validateNewsSection(section); }
function validateLandingReviewsSection(section = {}) { return landingModel.validateReviewsSection(section); }
function getLandingSectionValidation(sectionId = '', record = _landingPageState) { return landingModel.getSectionValidation(sectionId, record); }
function applyLandingSectionPublish(record = createDefaultLandingPageRecord(), sectionIds = []) { return landingModel.applySectionPublish(record, sectionIds); }
function computeLandingStatusForRestaurant(section = {}, restaurantId = '', now = Date.now(), timeZone = RESTAURANT_TIME_ZONE) {
  return landingModel.computeRestaurantStatus(section, restaurantId, now, timeZone);
}
function renderLandingHoursRowsHtml(section = {}, restaurantId = '', restaurantLabel = '') {
  return landingModel.renderHoursRowsHtml(section, restaurantId, restaurantLabel);
}
function getLandingRenderableNews(section = {}) { return landingModel.getRenderableNews(section); }
function buildLandingReviewPairs(section = {}) { return landingModel.buildReviewPairs(section); }
```

- [ ] **Step 4: Run the model and landing behavior tests again**

Run: `node --test tests/boundaries/landing.boundary.test.cjs tests/landing-page-hours.test.cjs tests/landing-page-content.test.cjs`
Expected: PASS, with the existing landing tests still green through the old global names and the new boundary suite proving the shared landing model exists outside `app.js`.

- [ ] **Step 5: Commit the model extraction**

```bash
git add core/landing/model.js app.js tests/boundaries/landing.boundary.test.cjs
git commit -m "refactor: extract landing model boundary"
```

### Task 3: Extract Landing Runtime State And Persistence

**Files:**
- Create: `core/landing/store.js`
- Create: `core/landing/data-service.js`
- Modify: `app.js`
- Modify: `tests/boundaries/landing.boundary.test.cjs`
- Test: `tests/boundaries/landing.boundary.test.cjs`
- Test: `tests/landing-page-hours.test.cjs`
- Test: `tests/landing-page-content.test.cjs`

- [ ] **Step 1: Add failing boundary tests for the landing store and landing data service**

```js
test('landing store tracks record, dirty state, load status, filters, panel, and carousel state', () => {
  const sandbox = loadSandboxWithScripts(['core/landing/store.js']);
  const store = sandbox.__HF_LANDING_MODULES__.createLandingStore({
    normalizeRecord: record => record || { id: 'root', draftContent: {}, liveContent: {}, draftSavedTs: '', livePublishedTs: '' },
    createDefaultRecord: () => ({ id: 'root', draftContent: {}, liveContent: {}, draftSavedTs: '', livePublishedTs: '' }),
    normalizeFilters: raw => ({ events: { showArchived: !!raw?.events?.showArchived }, news: { showArchived: false }, reviews: { showArchived: false } }),
    getDefaultFilters: () => ({ events: { showArchived: false }, news: { showArchived: false }, reviews: { showArchived: false } }),
  });

  store.setRecord({ id: 'root' }, { dirty: true });
  store.setLoadError('failed');
  store.setActivePanel('landing-admin-panel-news');
  store.setReviewCarouselIndex(2);
  store.setFilters({ events: { showArchived: true }, news: { showArchived: false }, reviews: { showArchived: false } });

  assert.equal(store.getRecord().id, 'root');
  assert.equal(store.isDirty(), true);
  assert.equal(store.getLoadError(), 'failed');
  assert.equal(store.getActivePanel(), 'landing-admin-panel-news');
  assert.equal(store.getReviewCarouselIndex(), 2);
  assert.equal(store.getFilters().events.showArchived, true);
});

test('landing data service caches loads and persists draft and live state through its ports', async () => {
  const sandbox = loadSandboxWithScripts(['core/landing/data-service.js']);
  const calls = [];
  const record = { id: 'root', draftContent: { news: { items: [] } }, liveContent: { news: { items: [] } }, draftSavedTs: '', livePublishedTs: '' };
  const service = sandbox.__HF_LANDING_MODULES__.createLandingDataService({
    store: {
      getRecord: () => null,
      getLoadPromise: () => null,
      setLoadPromise: promise => promise,
      setRecord: nextRecord => nextRecord,
      setLoadError: error => error,
      setDirty: value => value,
    },
    model: {
      normalizeRecord: input => input,
      applySectionPublish: (input, ids) => ({ ...input, livePublishedIds: ids }),
      createDefaultRecord: () => record,
    },
    fetchRecord: async options => {
      calls.push(['fetchRecord', options]);
      return record;
    },
    upsertRecord: async (payload, action) => {
      calls.push(['upsertRecord', action, payload]);
      return { ...record, ...payload };
    },
  });

  await service.ensureLoaded({ includeDraft: true });
  await service.saveDraft(record, 123);
  await service.publishSections(record, ['news'], 456);

  assert.deepEqual(calls, [
    ['fetchRecord', { includeDraft: true }],
    ['upsertRecord', 'save_landing_page_draft', {
      draft_content: record.draftContent,
      live_content: record.liveContent,
      draft_saved_ts: 123,
      live_published_ts: null,
    }],
    ['upsertRecord', 'publish_landing_sections', {
      draft_content: record.draftContent,
      live_content: record.liveContent,
      draft_saved_ts: null,
      live_published_ts: 456,
    }],
  ]);
});
```

- [ ] **Step 2: Run the landing boundary tests to verify the new state/data expectations fail**

Run: `node --test tests/boundaries/landing.boundary.test.cjs`
Expected: FAIL because `createLandingStore()` and `createLandingDataService()` are still Task-1 stubs and do not yet implement record, dirty, promise, or persistence behavior.

- [ ] **Step 3: Implement the store and persistence modules, then replace the app-owned state/load helpers with wrappers**

```js
// core/landing/store.js
(function bootstrapLandingStoreModule(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};

  function createLandingStoreImpl(deps = {}) {
    const normalizeRecord = typeof deps.normalizeRecord === 'function' ? deps.normalizeRecord : (record => record);
    const createDefaultRecord = typeof deps.createDefaultRecord === 'function' ? deps.createDefaultRecord : (() => ({ id: 'root' }));
    const normalizeFilters = typeof deps.normalizeFilters === 'function' ? deps.normalizeFilters : (raw => raw || {});
    const getDefaultFilters = typeof deps.getDefaultFilters === 'function' ? deps.getDefaultFilters : (() => ({}));

    let record = null;
    let dirty = false;
    let loadPromise = null;
    let loadError = '';
    let activePanel = 'landing-admin-panel-overview';
    let filters = null;
    let reviewCarouselIndex = 0;

    return {
      getRecord() { return record; },
      setRecord(nextRecord, options = {}) {
        record = normalizeRecord(nextRecord || createDefaultRecord());
        if (typeof options.dirty === 'boolean') dirty = options.dirty;
        return record;
      },
      isDirty() { return dirty; },
      setDirty(value = false) { dirty = !!value; return dirty; },
      getLoadPromise() { return loadPromise; },
      setLoadPromise(promise = null) { loadPromise = promise; return loadPromise; },
      getLoadError() { return loadError; },
      setLoadError(message = '') { loadError = message ? String(message) : ''; return loadError; },
      getActivePanel() { return activePanel; },
      setActivePanel(panelId = 'landing-admin-panel-overview') { activePanel = panelId || 'landing-admin-panel-overview'; return activePanel; },
      getFilters() { return filters || getDefaultFilters(); },
      setFilters(nextFilters = {}) { filters = normalizeFilters(nextFilters); return filters; },
      getReviewCarouselIndex() { return reviewCarouselIndex; },
      setReviewCarouselIndex(nextIndex = 0) { reviewCarouselIndex = Math.max(0, Number(nextIndex) || 0); return reviewCarouselIndex; },
    };
  }

  modules.createLandingStore = function createLandingStoreBoundary(deps = {}) {
    return createLandingStoreImpl(deps);
  };

  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

```js
// core/landing/data-service.js
(function bootstrapLandingDataServiceModule(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};

  function createLandingDataServiceImpl(deps = {}) {
    const store = deps.store;
    const model = deps.model;
    const fetchRecord = deps.fetchRecord;
    const upsertRecord = deps.upsertRecord;

    return {
      async ensureLoaded(options = {}) {
        const { force = false } = options;
        if (store.getRecord() && !force) return store.getRecord();
        if (store.getLoadPromise() && !force) return store.getLoadPromise();
        const pending = (async () => {
          try {
            const record = await fetchRecord(options);
            store.setLoadError('');
            store.setRecord(record, { dirty: false });
            store.setDirty(false);
            return store.getRecord();
          } catch (error) {
            store.setLoadError(error?.message || 'Landing page state could not be loaded.');
            throw error;
          } finally {
            store.setLoadPromise(null);
          }
        })();
        store.setLoadPromise(pending);
        return pending;
      },
      async saveDraft(record, timestamp) {
        const normalized = model.normalizeRecord(record || store.getRecord() || model.createDefaultRecord());
        const persisted = await upsertRecord({
          draft_content: normalized.draftContent,
          live_content: normalized.liveContent,
          draft_saved_ts: timestamp,
          live_published_ts: normalized.livePublishedTs ? Number(normalized.livePublishedTs) : null,
        }, 'save_landing_page_draft');
        store.setRecord(persisted, { dirty: false });
        store.setDirty(false);
        return store.getRecord();
      },
      async publishSections(record, selectedSectionIds = [], timestamp = Date.now()) {
        const normalized = model.normalizeRecord(record || store.getRecord() || model.createDefaultRecord());
        const nextLiveRecord = model.applySectionPublish(normalized, selectedSectionIds);
        const persisted = await upsertRecord({
          draft_content: normalized.draftContent,
          live_content: nextLiveRecord.liveContent,
          draft_saved_ts: normalized.draftSavedTs ? Number(normalized.draftSavedTs) : null,
          live_published_ts: timestamp,
        }, 'publish_landing_sections');
        store.setRecord({
          ...persisted,
          liveContent: nextLiveRecord.liveContent,
          livePublishedTs: String(timestamp),
        }, { dirty: false });
        store.setDirty(false);
        return store.getRecord();
      },
    };
  }

  modules.createLandingDataService = function createLandingDataServiceBoundary(deps = {}) {
    return createLandingDataServiceImpl(deps);
  };

  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

```js
// app.js: replace app-owned landing state and persistence bodies with wrappers
const landingStore = typeof LANDING_MODULES.createLandingStore === 'function'
  ? LANDING_MODULES.createLandingStore({
      normalizeRecord: record => landingModel.normalizeRecord(record),
      createDefaultRecord: () => landingModel.createDefaultRecord(),
      normalizeFilters: raw => landingModel.normalizeFilters ? landingModel.normalizeFilters(raw) : raw,
      getDefaultFilters: () => landingModel.getDefaultFilters ? landingModel.getDefaultFilters() : { events: { showArchived: false }, news: { showArchived: false }, reviews: { showArchived: false } },
    })
  : null;

const landingDataService = typeof LANDING_MODULES.createLandingDataService === 'function'
  ? LANDING_MODULES.createLandingDataService({
      store: landingStore,
      model: landingModel,
      fetchRecord: async ({ includeDraft = hasLandingAdminShell() } = {}) => {
        const payload = await readApiJsonOrNull(getLandingPageEndpoint(includeDraft), {
          headers: includeDraft ? getAuthorizedApiHeaders() : {},
        });
        if (!payload) throw new Error('Landing page state is missing.');
        return landingModel.normalizeRecord(payload);
      },
      upsertRecord: async (payload = {}, action = 'save_landing_page_draft') => {
        if (!currentUser?.accessToken) throw new Error('Sign in as an admin to edit the landing page.');
        const result = await postApiJson('/api/admin', { action, ...payload }, { headers: getAuthorizedApiHeaders() });
        if (!result.ok) throw new Error(result.payload?.error || 'Landing page save failed.');
        return landingModel.normalizeRecord(result.payload?.record || result.payload);
      },
    })
  : null;

function setLandingPageState(record, options = {}) { return landingStore.setRecord(record, options); }
function syncLandingDirtyFlag(value = false) { return landingStore.setDirty(value); }
async function ensureLandingPageStateLoaded(options = {}) { return landingDataService.ensureLoaded(options); }
```

- [ ] **Step 4: Re-run the landing boundary and landing behavior tests**

Run: `node --test tests/boundaries/landing.boundary.test.cjs tests/landing-page-hours.test.cjs tests/landing-page-content.test.cjs`
Expected: PASS, with record state, load caching, and save/publish persistence now owned by `core/landing/store.js` and `core/landing/data-service.js`.

- [ ] **Step 5: Commit the state/persistence extraction**

```bash
git add core/landing/store.js core/landing/data-service.js app.js tests/boundaries/landing.boundary.test.cjs
git commit -m "refactor: extract landing store and data service"
```

### Task 4: Extract The Landing Admin Workspace Runtime

**Files:**
- Create: `core/landing/admin-workspace.js`
- Modify: `app.js`
- Modify: `tests/boundaries/landing.boundary.test.cjs`
- Test: `tests/boundaries/landing.boundary.test.cjs`
- Test: `tests/landing-page-hours.test.cjs`
- Test: `tests/landing-page-content.test.cjs`

- [ ] **Step 1: Add a failing boundary test for the admin workspace service**

```js
test('landing admin workspace service updates hours without full rerender and refreshes overview state', () => {
  const sandbox = loadSandboxWithScripts(['core/landing/admin-workspace.js']);
  const calls = [];
  const service = sandbox.__HF_LANDING_MODULES__.createLandingAdminWorkspaceService({
    model: {
      createDefaultRecord: () => ({
        id: 'root',
        draftContent: { hours: { restaurants: { leroys: { days: { wed: { closed: true, open: '', close: '' } } } } }, events: { items: [] }, news: { items: [] }, reviews: { restaurants: {} } },
        liveContent: { hours: { restaurants: { leroys: { days: { wed: { closed: true, open: '', close: '' } } } } }, events: { items: [] }, news: { items: [] }, reviews: { restaurants: {} } },
        draftSavedTs: '',
        livePublishedTs: '',
      }),
      normalizeRecord: record => record,
      normalizeTimeValue: value => value,
      getDraftDiffSectionIds: () => ['hours'],
      validateHoursSection: () => ({ valid: true, issues: [] }),
    },
    store: {
      getRecord: () => null,
      setRecord: record => record,
      isDirty: () => true,
      setDirty: value => value,
      getLoadError: () => '',
      getActivePanel: () => 'landing-admin-panel-overview',
      setActivePanel: panelId => panelId,
    },
    renderOverview: () => calls.push('renderOverview'),
    renderHoursValidationState: () => calls.push('renderHoursValidationState'),
    updateToolbar: () => calls.push('updateToolbar'),
    rerenderWorkspace: () => calls.push('rerenderWorkspace'),
  });

  service.setHoursField('leroys', 'wed', 'open', '16:00');

  assert.deepEqual(calls, ['renderOverview', 'renderHoursValidationState', 'updateToolbar']);
});
```

- [ ] **Step 2: Run the targeted tests to confirm the admin service does not exist yet**

Run: `node --test tests/boundaries/landing.boundary.test.cjs tests/landing-page-hours.test.cjs tests/landing-page-content.test.cjs`
Expected: FAIL because `createLandingAdminWorkspaceService()` is still a stub and `app.js` still owns landing admin rendering and mutation logic.

- [ ] **Step 3: Implement `core/landing/admin-workspace.js` and convert app globals into wrappers**

```js
(function bootstrapLandingAdminWorkspaceModule(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};

  function createLandingAdminWorkspaceServiceImpl(deps = {}) {
    const model = deps.model;
    const store = deps.store;
    const dataService = deps.dataService;
    const document = deps.document;
    const escHtml = typeof deps.escHtml === 'function' ? deps.escHtml : (value => String(value));
    const showToast = typeof deps.showToast === 'function' ? deps.showToast : (() => {});
    const hasAdminShell = typeof deps.hasAdminShell === 'function' ? deps.hasAdminShell : (() => false);
    const focusAdminPanel = typeof deps.focusAdminPanel === 'function' ? deps.focusAdminPanel : (() => {});
    const renderHoursPanel = typeof deps.renderHoursPanel === 'function' ? deps.renderHoursPanel : (() => {});
    const renderEventsPanel = typeof deps.renderEventsPanel === 'function' ? deps.renderEventsPanel : (() => {});
    const renderNewsPanel = typeof deps.renderNewsPanel === 'function' ? deps.renderNewsPanel : (() => {});
    const renderReviewsPanel = typeof deps.renderReviewsPanel === 'function' ? deps.renderReviewsPanel : (() => {});

    function renderOverview(record = store.getRecord()) {
      const normalized = model.normalizeRecord(record || model.createDefaultRecord());
      const diffSectionIds = model.getDraftDiffSectionIds(normalized);
      const sectionValidations = ['hours', 'events', 'news', 'reviews'].map(sectionId => ({
        sectionId,
        validation: model.getSectionValidation(sectionId, normalized),
      }));
      const blockingIssues = sectionValidations.flatMap(entry => entry.validation.issues);
      const allValid = sectionValidations.every(entry => entry.validation.valid);
      const rootStatusEl = document.getElementById('landing-overview-root-status');
      const draftCopyEl = document.getElementById('landing-overview-draft-copy');
      const liveCopyEl = document.getElementById('landing-overview-live-copy');
      const healthBadgeEl = document.getElementById('landing-overview-health-badge');
      const issuesEl = document.getElementById('landing-overview-issues');

      if (rootStatusEl) rootStatusEl.textContent = store.getLoadError() ? 'Fallback ready' : 'Live shell ready';
      if (draftCopyEl) draftCopyEl.textContent = diffSectionIds.length
        ? `${diffSectionIds.length} subsection draft${diffSectionIds.length === 1 ? '' : 's'} differ from live.`
        : 'Draft and live are currently aligned.';
      if (liveCopyEl) liveCopyEl.textContent = normalized.livePublishedTs
        ? 'Publish promotes only the sections you select.'
        : 'No landing-page sections have been published live yet.';
      if (healthBadgeEl) {
        healthBadgeEl.textContent = allValid ? 'Healthy' : 'Needs attention';
        healthBadgeEl.className = `landing-admin-section-badge ${allValid ? 'is-ready' : 'is-blocked'}`;
      }
      if (issuesEl) {
        issuesEl.innerHTML = allValid
          ? ''
          : blockingIssues.map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`).join('');
      }
    }

    function renderHoursValidationState(record = store.getRecord()) {
      const normalized = model.normalizeRecord(record || model.createDefaultRecord());
      const issuesEl = document.getElementById('landing-hours-issues');
      const badgeEl = document.getElementById('landing-hours-panel-badge');
      const validation = model.validateHoursSection(syncHoursDraftFromDom().draftContent.hours);
      if (issuesEl) {
        issuesEl.innerHTML = validation.valid
          ? ''
          : validation.issues.map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`).join('');
      }
      if (badgeEl) {
        badgeEl.textContent = validation.valid ? 'Ready' : 'Blocked';
        badgeEl.className = `landing-admin-section-badge ${validation.valid ? 'is-ready' : 'is-blocked'}`;
      }
      return normalized;
    }

    function updateToolbar(record = store.getRecord()) {
      const normalized = model.normalizeRecord(record || model.createDefaultRecord());
      const diffSectionIds = model.getDraftDiffSectionIds(normalized);
      const draftButton = document.getElementById('landing-save-draft-btn');
      const publishButton = document.getElementById('landing-publish-btn');
      const noteEl = document.getElementById('landing-admin-toolbar-note');
      if (draftButton) draftButton.disabled = !store.isDirty();
      if (publishButton) publishButton.disabled = diffSectionIds.length === 0;
      if (noteEl) {
        noteEl.textContent = store.getLoadError()
          ? store.getLoadError()
          : (store.isDirty()
              ? 'Save Draft stores the shared landing snapshot without changing the public root.'
              : (diffSectionIds.length
                  ? 'Publish Live promotes only the subsections you select.'
                  : 'Landing-page draft and live snapshots are currently aligned.'));
      }
    }

    function syncHoursDraftFromDom() {
      const fields = Array.from(document.querySelectorAll('[data-landing-hours-field]'));
      const record = store.setRecord(store.getRecord() || model.createDefaultRecord(), { dirty: store.isDirty() });
      if (!fields.length) return record;
      const groupedDays = new Map();
      fields.forEach(fieldEl => {
        const restaurantId = fieldEl.getAttribute('data-landing-hours-restaurant') || '';
        const dayKey = fieldEl.getAttribute('data-landing-hours-day') || '';
        const field = fieldEl.getAttribute('data-landing-hours-field') || '';
        if (!restaurantId || !dayKey || !field) return;
        const key = `${restaurantId}:${dayKey}`;
        const entry = groupedDays.get(key) || { restaurantId, dayKey };
        if (field === 'closed') entry.closed = !!fieldEl.checked;
        if (field === 'open' || field === 'close') entry[field] = model.normalizeTimeValue(fieldEl.value);
        groupedDays.set(key, entry);
      });
      groupedDays.forEach(({ restaurantId, dayKey, open, close, closed }) => {
        const restaurantHours = record.draftContent.hours.restaurants[restaurantId] || { days: {} };
        const currentDay = restaurantHours.days[dayKey] || { closed: true, open: '', close: '' };
        restaurantHours.days[dayKey] = {
          closed: !!closed,
          open: closed ? '' : (typeof open === 'string' ? open : currentDay.open),
          close: closed ? '' : (typeof close === 'string' ? close : currentDay.close),
        };
        record.draftContent.hours.restaurants[restaurantId] = restaurantHours;
      });
      return store.setRecord(record, { dirty: store.isDirty() });
    }

    function refreshHoursAdminState(record = store.getRecord()) {
      renderOverview(record);
      renderHoursValidationState(record);
      updateToolbar(record);
    }

    function setHoursField(restaurantId, dayKey, field, value) {
      const record = store.setRecord(store.getRecord() || model.createDefaultRecord(), { dirty: true });
      if (!record.draftContent.hours.restaurants[restaurantId]) {
        record.draftContent.hours.restaurants[restaurantId] = { days: {} };
      }
      const targetDay = record.draftContent.hours.restaurants[restaurantId].days[dayKey] || { closed: true, open: '', close: '' };
      if (field === 'closed') {
        targetDay.closed = !!value;
        if (targetDay.closed) {
          targetDay.open = '';
          targetDay.close = '';
        }
      } else {
        targetDay[field] = model.normalizeTimeValue(value);
        if (targetDay[field]) targetDay.closed = false;
      }
      record.draftContent.hours.restaurants[restaurantId].days[dayKey] = targetDay;
      store.setDirty(true);
      if (field === 'closed') return renderWorkspace();
      return refreshHoursAdminState(record);
    }

    function updateDraftRecord(mutator = () => {}, options = {}) {
      const rerender = options.rerender !== false;
      const record = store.setRecord(store.getRecord() || model.createDefaultRecord(), { dirty: true });
      mutator(record);
      store.setDirty(true);
      if (rerender) renderWorkspace();
      return record;
    }

    function updateEventField(itemId = '', field = '', value = '') {
      updateDraftRecord(record => {
        const item = (record.draftContent.events.items || []).find(entry => entry?.id === itemId);
        if (!item) return;
        if (field === 'target') item.target = model.normalizeTarget(value, { allowBoth: true });
        else if (field === 'startTime' || field === 'endTime') item[field] = model.normalizeTimeValue(value);
        else item[field] = typeof value === 'string' ? value : '';
        item.updatedAt = String(Date.now());
      });
    }

    function updateNewsField(itemId = '', field = '', value = '') {
      updateDraftRecord(record => {
        const item = (record.draftContent.news.items || []).find(entry => entry?.id === itemId);
        if (!item) return;
        if (field === 'target') item.target = model.normalizeTarget(value, { allowBoth: true });
        else item[field] = typeof value === 'string' ? value : '';
        if (field === 'href' && !item.importMeta?.sourceUrl) {
          item.importMeta = model.normalizeImportMeta({ ...item.importMeta, sourceUrl: item.href });
        }
        item.updatedAt = String(Date.now());
      });
    }

    function updateReviewField(restaurantId = '', itemId = '', field = '', value = '') {
      updateDraftRecord(record => {
        const items = record.draftContent.reviews.restaurants[restaurantId] || [];
        const item = items.find(entry => entry?.id === itemId);
        if (!item) return;
        if (field === 'rating') item.rating = value ? String(Number(value)) : '';
        else item[field] = typeof value === 'string' ? value : '';
        if (field === 'href' && !item.importMeta?.sourceUrl) {
          item.importMeta = model.normalizeImportMeta({ ...item.importMeta, sourceUrl: item.href });
        }
        item.updatedAt = String(Date.now());
      });
    }

    function renderWorkspace(options = {}) {
      if (!hasAdminShell()) return;
      const { forceReload = false } = options;
      const render = (record) => {
        const normalized = store.setRecord(model.normalizeRecord(record || model.createDefaultRecord()), { dirty: store.isDirty() });
        renderOverview(normalized);
        renderHoursPanel(normalized);
        renderEventsPanel(normalized);
        renderNewsPanel(normalized);
        renderReviewsPanel(normalized);
        updateToolbar(normalized);
        focusAdminPanel(store.getActivePanel());
      };
      if (store.getRecord() && !forceReload) return render(store.getRecord());
      updateToolbar(model.createDefaultRecord());
      return dataService.ensureLoaded({ force: forceReload, includeDraft: true }).then(render).catch(() => render(store.getRecord() || model.createDefaultRecord()));
    }

    async function saveDraft() {
      try {
        const record = model.normalizeRecord(syncHoursDraftFromDom() || await dataService.ensureLoaded({ includeDraft: true }));
        await dataService.saveDraft(record, Date.now());
        renderWorkspace();
        showToast('✅ Landing page draft saved.', 'success');
      } catch (error) {
        showToast(`⚠️ ${error?.message || 'Landing page draft save failed.'}`, 'error');
      }
    }

    async function publishSections() {
      const selectedSectionIds = Array.from(document.querySelectorAll('[data-landing-publish-section]:checked'))
        .map(input => input.getAttribute('data-landing-publish-section'))
        .filter(Boolean);
      if (!selectedSectionIds.length) {
        showToast('Select at least one landing-page subsection to publish.', 'info');
        return;
      }
      const currentRecord = model.normalizeRecord(syncHoursDraftFromDom() || await dataService.ensureLoaded({ includeDraft: true }));
      const sectionLabels = (model.getConstants && model.getConstants().SECTION_LABELS) || {};
      const blockedSection = selectedSectionIds
        .map(sectionId => {
          const validation = model.getSectionValidation(sectionId, currentRecord);
          return {
            sectionId,
            label: sectionLabels[sectionId] || sectionId,
            isValid: validation.valid,
            issues: validation.issues,
          };
        })
        .find(status => !status.isValid);
      if (blockedSection) {
        showToast(`⚠️ Fix ${blockedSection.label.toLowerCase()} before publishing it live.`, 'error');
        return;
      }
      try {
        await dataService.publishSections(currentRecord, selectedSectionIds, Date.now());
        renderWorkspace();
        if (deps.renderRootPage) deps.renderRootPage(store.getRecord());
        if (deps.closePublishModal) deps.closePublishModal();
        showToast(`✅ Published ${selectedSectionIds.length} landing-page section${selectedSectionIds.length === 1 ? '' : 's'} live.`, 'success');
      } catch (error) {
        showToast(`⚠️ ${error?.message || 'Landing page publish failed.'}`, 'error');
      }
    }

    return {
      renderWorkspace,
      renderOverview,
      renderHoursValidationState,
      updateToolbar,
      syncHoursDraftFromDom,
      setHoursField,
      updateEventField,
      updateDraftRecord,
      updateNewsField,
      updateReviewField,
      saveDraft,
      publishSections,
    };
  }

  modules.createLandingAdminWorkspaceService = function createLandingAdminWorkspaceServiceBoundary(deps = {}) {
    return createLandingAdminWorkspaceServiceImpl(deps);
  };

  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

```js
// app.js wrappers after wiring the admin service
const landingAdminWorkspace = typeof LANDING_MODULES.createLandingAdminWorkspaceService === 'function'
  ? LANDING_MODULES.createLandingAdminWorkspaceService({
      model: landingModel,
      store: landingStore,
      dataService: landingDataService,
      document,
      escHtml,
      showToast,
      hasAdminShell: () => hasLandingAdminShell(),
      focusAdminPanel: (panelId, trigger) => focusLandingAdminPanel(panelId, trigger),
      renderHoursPanel: record => renderLandingHoursPanel(record),
      renderEventsPanel: record => renderLandingEventsPanel(record),
      renderNewsPanel: record => renderLandingNewsPanel(record),
      renderReviewsPanel: record => renderLandingReviewsPanel(record),
    })
  : null;

function renderLandingOverview(record = landingStore.getRecord()) { return landingAdminWorkspace.renderOverview(record); }
function syncLandingHoursDraftFromDom() { return landingAdminWorkspace.syncHoursDraftFromDom(); }
function renderLandingHoursValidationState(record = landingStore.getRecord()) { return landingAdminWorkspace.renderHoursValidationState(record); }
function updateLandingAdminToolbar(record = landingStore.getRecord()) { return landingAdminWorkspace.updateToolbar(record); }
function renderLandingAdminWorkspace(options = {}) { return landingAdminWorkspace.renderWorkspace(options); }
function setLandingHoursField(restaurantId, dayKey, field, value) { return landingAdminWorkspace.setHoursField(restaurantId, dayKey, field, value); }
function updateLandingEventField(itemId = '', field = '', value = '') { return landingAdminWorkspace.updateEventField(itemId, field, value); }
function updateLandingNewsField(itemId = '', field = '', value = '') { return landingAdminWorkspace.updateNewsField(itemId, field, value); }
function updateLandingReviewField(restaurantId = '', itemId = '', field = '', value = '') { return landingAdminWorkspace.updateReviewField(restaurantId, itemId, field, value); }
function saveLandingPageDraft() { return landingAdminWorkspace.saveDraft(); }
function publishLandingPageSections() { return landingAdminWorkspace.publishSections(); }
```

- [ ] **Step 4: Run the admin-focused landing tests and boundary suite**

Run: `node --test tests/boundaries/landing.boundary.test.cjs tests/landing-page-hours.test.cjs tests/landing-page-content.test.cjs`
Expected: PASS, with the existing hours/content tests still covering the same behavior through global wrappers while the implementation now lives in `core/landing/admin-workspace.js`.

- [ ] **Step 5: Commit the admin-workspace extraction**

```bash
git add core/landing/admin-workspace.js app.js tests/boundaries/landing.boundary.test.cjs
git commit -m "refactor: extract landing admin workspace"
```

### Task 5: Extract The Landing Root Renderer And Finish App.js Orchestration

**Files:**
- Create: `core/landing/root-renderer.js`
- Modify: `app.js`
- Modify: `index.html`
- Modify: `manager/index.html`
- Modify: `admin/index.html`
- Modify: `leroyslounge/index.html`
- Modify: `elroyscantina/index.html`
- Modify: `scripts/check-html-script-order.cjs`
- Modify: `tests/helpers/runtime.cjs`
- Modify: `tests/runtime-helpers.test.cjs`
- Test: `tests/landing-page-hours.test.cjs`
- Test: `tests/landing-page-content.test.cjs`
- Test: `tests/boundaries/landing.boundary.test.cjs`
- Test: `tests/runtime-helpers.test.cjs`

- [ ] **Step 1: Add a failing root-renderer boundary test, app-delegation test, and the final script-order expectation**

```js
test('landing root renderer service controls root fallback and review carousel state', () => {
  const sandbox = loadSandboxWithScripts(['core/landing/root-renderer.js']);
  const calls = [];
  const service = sandbox.__HF_LANDING_MODULES__.createLandingRootRendererService({
    model: {
      normalizeRecord: record => record,
      computeRestaurantStatus: () => ({ isOpen: false, label: 'Closed for now', todayRangeLabel: 'Closed', weekRows: [] }),
      getRenderableEvents: () => [],
      getRenderableNews: () => [],
      buildReviewPairs: () => [],
    },
    store: {
      getReviewCarouselIndex: () => 0,
      setReviewCarouselIndex: value => value,
    },
    document: {
      getElementById: () => ({ hidden: false, innerHTML: '', textContent: '', classList: { toggle() {} } }),
      querySelector: () => ({ hidden: false }),
      querySelectorAll: () => [],
    },
    hasRootShell: () => true,
  });

  service.setFallbackVisible(true);
  service.renderRootPage({ id: 'root', liveContent: { hours: {}, events: {}, news: {}, reviews: {} } });

  assert.equal(typeof service.stepReviewCarousel, 'function');
});

test('app landing globals delegate through the landing runtime boundary', async () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_LANDING_MODULES__: {
      createLandingModel: () => ({
        createDefaultRecord: () => ({ id: 'root', draftContent: {}, liveContent: {}, draftSavedTs: '', livePublishedTs: '' }),
        normalizeRecord: record => record,
        normalizeTarget: value => value,
        normalizeImportMeta: value => value,
        normalizeTimeValue: value => value,
        validateHoursSection: () => ({ valid: true, issues: [] }),
        validateEventsSection: () => ({ valid: true, issues: [] }),
        validateNewsSection: () => ({ valid: true, issues: [] }),
        validateReviewsSection: () => ({ valid: true, issues: [] }),
        getSectionValidation: () => ({ valid: true, issues: [] }),
        applySectionPublish: (record, ids) => ({ ...record, publishedIds: ids }),
        computeRestaurantStatus: () => ({ isOpen: false, label: 'Closed for now', todayRangeLabel: 'Closed', weekRows: [] }),
        getRenderableNews: section => section.items || [],
        buildReviewPairs: () => [],
        renderHoursRowsHtml: () => '<div>hours</div>',
      }),
      createLandingStore: () => ({ getRecord: () => null, isDirty: () => false, setDirty: () => false }),
      createLandingDataService: () => ({
        ensureLoaded: async options => {
          calls.push(['ensureLoaded', options]);
          return { id: 'root', draftContent: {}, liveContent: {}, draftSavedTs: '', livePublishedTs: '' };
        },
      }),
      createLandingAdminWorkspaceService: () => ({
        renderWorkspace: options => calls.push(['renderWorkspace', options]),
        setHoursField: (...args) => calls.push(['setHoursField', ...args]),
        saveDraft: async () => calls.push(['saveDraft']),
        publishSections: async () => calls.push(['publishSections']),
      }),
      createLandingRootRendererService: () => ({
        renderRootPage: record => calls.push(['renderRootPage', record]),
        setFallbackVisible: visible => calls.push(['setFallbackVisible', visible]),
        setReviewCarouselIndex: index => calls.push(['setReviewCarouselIndex', index]),
        stepReviewCarousel: direction => calls.push(['stepReviewCarousel', direction]),
      }),
    },
  });

  await sandbox.ensureLandingPageStateLoaded({ force: true });
  sandbox.renderLandingAdminWorkspace({ forceReload: true });
  sandbox.setLandingHoursField('rest-1', 'fri', 'open', '16:00');
  await sandbox.saveLandingPageDraft();
  await sandbox.publishLandingPageSections();
  sandbox.renderLandingRootPage({ id: 'root' });
  sandbox.setLandingRootFallbackVisible(true);
  sandbox.setLandingReviewCarouselIndex(1);
  sandbox.stepLandingReviewCarousel(-1);

  assert.deepEqual(calls, [
    ['ensureLoaded', { force: true }],
    ['renderWorkspace', { forceReload: true }],
    ['setHoursField', 'rest-1', 'fri', 'open', '16:00'],
    ['saveDraft'],
    ['publishSections'],
    ['renderRootPage', { id: 'root' }],
    ['setFallbackVisible', true],
    ['setReviewCarouselIndex', 1],
    ['stepReviewCarousel', -1],
  ]);
});
```

```js
const SHARED_RUNTIME_SCRIPTS = [
  '/core/domain/constants.js',
  '/core/domain/category-defaults.js',
  '/core/auth/auth-api.js',
  '/core/auth/auth-session-service.js',
  '/core/auth/auth-overlay-template.js',
  '/core/auth/auth-overlay-controller.js',
  '/core/ui/manager/workspace.js',
  '/core/ui/manager/sections.js',
  '/core/ui/manager/editors.js',
  '/core/ui/admin/workspace.js',
  '/core/ui/admin/switcher.js',
  '/core/ui/public/footer-actions.js',
  '/core/ui/public/renderer-default.js',
  '/core/session/publish-service.js',
  '/core/session/menu-session.js',
  '/core/data/menu-state-loader.js',
  '/core/session/poll-scheduler.js',
  '/core/landing/model.js',
  '/core/landing/store.js',
  '/core/landing/data-service.js',
  '/core/landing/admin-workspace.js',
  '/core/landing/root-renderer.js',
];
```

- [ ] **Step 2: Run the full landing test set and script-order check to see the missing root boundary fail**

Run: `node --test tests/boundaries/landing.boundary.test.cjs tests/landing-page-hours.test.cjs tests/landing-page-content.test.cjs tests/runtime-helpers.test.cjs`
Expected: FAIL because `createLandingRootRendererService()` is still a stub, `app.js` is not delegating the root runtime yet, and the HTML/script-order expectations are not updated.

- [ ] **Step 3: Implement `core/landing/root-renderer.js`, switch the last app-owned root functions to wrappers, and wire every shell**

```js
// core/landing/root-renderer.js
(function bootstrapLandingRootRendererModule(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};

  function createLandingRootRendererServiceImpl(deps = {}) {
    const model = deps.model;
    const store = deps.store;
    const document = deps.document;
    const hasRootShell = typeof deps.hasRootShell === 'function' ? deps.hasRootShell : (() => false);

    function setSectionVisible(sectionId = '', visible = true) {
      const sectionEl = document.getElementById(sectionId);
      if (sectionEl) sectionEl.hidden = !visible;
      const dotEl = document.querySelector(`[data-landing-dot="${sectionId}"]`);
      if (dotEl) dotEl.hidden = !visible;
    }

    function setFallbackVisible(visible) {
      const shellEl = document.getElementById('landing-root-shell');
      const fallbackEl = document.getElementById('landing-root-fallback');
      const dotNavEl = document.querySelector('.landing-dot-nav');
      if (shellEl) shellEl.hidden = !!visible;
      if (fallbackEl) fallbackEl.hidden = !visible;
      if (dotNavEl) dotNavEl.hidden = !!visible;
    }

    function renderRootPage(record) {
      if (!hasRootShell()) return;
      const normalized = model.normalizeRecord(record);
      renderRootHours(normalized.liveContent.hours);
      renderRootEvents(normalized.liveContent.events);
      renderRootNews(normalized.liveContent.news);
      renderRootReviews(normalized.liveContent.reviews);
      setFallbackVisible(false);
    }

    function setReviewCarouselIndex(nextIndex = 0) {
      const pairEls = Array.from(document.querySelectorAll('[data-landing-review-pair]'));
      if (!pairEls.length) return;
      const bounded = Math.max(0, Math.min(Number(nextIndex) || 0, pairEls.length - 1));
      store.setReviewCarouselIndex(bounded);
      pairEls.forEach((pairEl, index) => pairEl.classList.toggle('is-active', index === bounded));
      document.querySelectorAll('.landing-review-dot').forEach((dotEl, index) => dotEl.classList.toggle('is-active', index === bounded));
    }

    function stepReviewCarousel(direction = 1) {
      const pairCount = document.querySelectorAll('[data-landing-review-pair]').length;
      if (!pairCount) return;
      const nextIndex = (store.getReviewCarouselIndex() + direction + pairCount) % pairCount;
      setReviewCarouselIndex(nextIndex);
    }

    return {
      setFallbackVisible,
      renderRootPage,
      renderRootHours,
      renderRootEvents,
      renderRootNews,
      renderRootReviews,
      setReviewCarouselIndex,
      stepReviewCarousel,
    };
  }

  modules.createLandingRootRendererService = function createLandingRootRendererServiceBoundary(deps = {}) {
    return createLandingRootRendererServiceImpl(deps);
  };

  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

```js
// app.js final landing wrappers
const landingRootRenderer = typeof LANDING_MODULES.createLandingRootRendererService === 'function'
  ? LANDING_MODULES.createLandingRootRendererService({
      model: landingModel,
      store: landingStore,
      document,
      hasRootShell: () => hasLandingRootShell(),
    })
  : null;

function setLandingRootFallbackVisible(visible) { return landingRootRenderer.setFallbackVisible(visible); }
function renderLandingRootPage(record = landingStore.getRecord()) { return landingRootRenderer.renderRootPage(record); }
function setLandingReviewCarouselIndex(nextIndex = 0) { return landingRootRenderer.setReviewCarouselIndex(nextIndex); }
function stepLandingReviewCarousel(direction = 1) { return landingRootRenderer.stepReviewCarousel(direction); }
```

```html
<script src="/core/landing/model.js"></script>
<script src="/core/landing/store.js"></script>
<script src="/core/landing/data-service.js"></script>
<script src="/core/landing/admin-workspace.js"></script>
<script src="/core/landing/root-renderer.js"></script>
<script src="/app.js"></script>
```

- [ ] **Step 4: Run the full verification set, including syntax and HTML ordering**

Run: `node --test tests/boundaries/landing.boundary.test.cjs tests/landing-page-hours.test.cjs tests/landing-page-content.test.cjs tests/runtime-helpers.test.cjs`
Expected: PASS

Run: `node --check app.js`
Expected: PASS

Run: `node scripts/check-html-script-order.cjs`
Expected: `HTML script order check passed.`

- [ ] **Step 5: Commit the final landing split**

```bash
git add core/landing/root-renderer.js app.js index.html manager/index.html admin/index.html leroyslounge/index.html elroyscantina/index.html scripts/check-html-script-order.cjs tests/helpers/runtime.cjs tests/runtime-helpers.test.cjs
git commit -m "refactor: move landing runtime out of app"
```

## Self-Review

1. **Spec coverage:** The model task covers `createDefaultLandingPageRecord()`, the normalize helpers, validation helpers, hours/status helpers, `applyLandingSectionPublish()`, `getLandingRenderableNews()`, and `buildLandingReviewPairs()`. The state/data task covers `ensureLandingPageStateLoaded()`, app-owned landing state, draft/live persistence, and selective publish persistence. The admin task covers `renderLandingAdminWorkspace()`, `renderLandingOverview()`, field update handlers, draft save flow, publish flow, and draft-vs-live separation. The root task covers `renderLandingRootPage()`, landing root fallback behavior, and the review carousel. Existing landing tests remain the main regression suite all the way through.
2. **Placeholder scan:** No step says `TODO`, `TBD`, or "handle later." Every task names exact files, commands, and concrete code shapes, and the admin-task code snippets now show real method bodies for the hours sync, field mutation, render orchestration, save flow, and publish flow.
3. **Type consistency:** The plan uses one consistent registry (`__HF_LANDING_MODULES__`) and one consistent factory set: `createLandingModel`, `createLandingStore`, `createLandingDataService`, `createLandingAdminWorkspaceService`, and `createLandingRootRendererService`. App-level wrappers retain the current public names so existing tests and inline HTML handlers do not need API renames.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-appjs-landing-runtime-split.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
