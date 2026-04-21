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

test('landing store tracks record, dirty state, load status, filters, panel, and review carousel index', () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/model.js',
    'core/landing/store.js',
  ]);
  const model = sandbox.__HF_LANDING_MODULES__.createLandingModel();
  const store = sandbox.__HF_LANDING_MODULES__.createLandingStore({
    model,
    defaultActivePanel: 'landing-admin-panel-overview',
    defaultFilters: {
      events: { showArchived: false },
      news: { showArchived: false },
      reviews: { showArchived: false },
    },
  });
  const record = model.createDefaultRecord();
  const loadPromise = Promise.resolve(record);

  assert.equal(JSON.stringify(store.getRecord()), JSON.stringify(model.createDefaultRecord()));
  assert.equal(store.isDirty(), false);
  assert.equal(store.getLoadPromise(), null);
  assert.equal(store.getLoadError(), '');
  assert.equal(store.getActivePanel(), 'landing-admin-panel-overview');
  assert.equal(store.getReviewCarouselIndex(), 0);
  assert.deepEqual(store.getFilters(), {
    events: { showArchived: false },
    news: { showArchived: false },
    reviews: { showArchived: false },
  });

  store.setRecord(record, { dirty: true });
  assert.equal(JSON.stringify(store.getRecord()), JSON.stringify(record));
  assert.equal(store.isDirty(), true);
  assert.equal(store.setDirty(false), false);
  assert.equal(store.setLoadPromise(loadPromise), loadPromise);
  assert.equal(store.getLoadPromise(), loadPromise);
  assert.equal(store.setLoadError('network down'), 'network down');
  assert.equal(store.getLoadError(), 'network down');
  assert.equal(store.setActivePanel('landing-admin-panel-news'), 'landing-admin-panel-news');
  assert.equal(store.getActivePanel(), 'landing-admin-panel-news');
  assert.equal(store.setReviewCarouselIndex(3), 3);
  assert.equal(store.getReviewCarouselIndex(), 3);
  assert.deepEqual(
    store.setFilters({ news: { showArchived: true } }),
    {
      events: { showArchived: false },
      news: { showArchived: true },
      reviews: { showArchived: false },
    }
  );
});

test('landing data service caches loads and persists draft/live state through injected ports', async () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/model.js',
    'core/landing/store.js',
    'core/landing/data-service.js',
  ]);
  const model = sandbox.__HF_LANDING_MODULES__.createLandingModel();
  const store = sandbox.__HF_LANDING_MODULES__.createLandingStore({
    model,
    defaultActivePanel: 'landing-admin-panel-overview',
    defaultFilters: {},
  });
  const fetchedRecord = model.createDefaultRecord();
  fetchedRecord.draftContent.overview.heroTitle = 'Loaded draft';
  const upsertedRecord = model.createDefaultRecord();
  upsertedRecord.draftSavedTs = '2000';
  upsertedRecord.livePublishedTs = '3000';
  let fetchCalls = 0;
  const fetchPorts = [];
  const upsertPorts = [];
  let releaseFetch;
  const pendingFetch = new Promise(resolve => {
    releaseFetch = () => resolve(fetchedRecord);
  });
  const service = sandbox.__HF_LANDING_MODULES__.createLandingDataService({
    model,
    store,
    fetchRecord: async options => {
      fetchCalls += 1;
      fetchPorts.push(options);
      return pendingFetch;
    },
    upsertRecord: async (payload, action) => {
      upsertPorts.push({ payload, action });
      return upsertedRecord;
    },
  });

  const firstLoad = service.ensureLoaded({ includeDraft: true });
  const secondLoad = service.ensureLoaded({ includeDraft: true });

  assert.equal(firstLoad, secondLoad);
  assert.equal(fetchCalls, 1);
  assert.equal(store.getLoadPromise(), firstLoad);

  releaseFetch();
  const loadedRecord = await firstLoad;

  assert.equal(fetchPorts[0].includeDraft, true);
  assert.equal(store.getLoadPromise(), null);
  assert.equal(store.isDirty(), false);
  assert.equal(loadedRecord.draftContent.overview.heroTitle, 'Loaded draft');

  const cachedLoad = await service.ensureLoaded({ includeDraft: true });
  assert.equal(fetchCalls, 1);
  assert.equal(cachedLoad.draftContent.overview.heroTitle, 'Loaded draft');

  const draftResult = await service.saveDraft(loadedRecord, 2000);
  assert.equal(upsertPorts[0].action, 'save_landing_page_draft');
  assert.equal(upsertPorts[0].payload.draft_saved_ts, 2000);
  assert.equal(store.isDirty(), false);
  assert.equal(draftResult.draftSavedTs, '2000');

  const publishResult = await service.publishSections(loadedRecord, ['news', 'reviews'], 3000);
  assert.equal(upsertPorts[1].action, 'publish_landing_sections');
  assert.equal(upsertPorts[1].payload.live_published_ts, 3000);
  assert.deepEqual(
    upsertPorts[1].payload.live_content,
    model.applySectionPublish(loadedRecord, ['news', 'reviews']).liveContent
  );
  assert.equal(store.isDirty(), false);
  assert.equal(publishResult.livePublishedTs, '3000');
});

test('landing model factory publishes selected draft sections without mutating live state', () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/model.js',
  ]);
  const model = sandbox.__HF_LANDING_MODULES__.createLandingModel();
  assert.equal(typeof model.createDefaultImportMeta, 'function');
  assert.equal(typeof model.createDefaultContent, 'function');
  assert.equal(typeof model.normalizeTimestamp, 'function');
  assert.equal(typeof model.normalizeDay, 'function');
  assert.equal(typeof model.normalizeHoursRestaurant, 'function');
  assert.equal(typeof model.normalizeEventItem, 'function');
  assert.equal(typeof model.normalizeNewsItem, 'function');
  assert.equal(typeof model.normalizeReviewItem, 'function');
  assert.equal(typeof model.normalizeContent, 'function');
  assert.equal(typeof model.validateEventItem, 'function');
  assert.equal(typeof model.validateNewsItem, 'function');
  assert.equal(typeof model.validateReviewItem, 'function');
  const record = model.createDefaultRecord();

  record.draftContent.news.items.push({
    id: 'news-1',
    title: 'Draft story',
    body: 'Draft-only copy',
    target: 'both',
    href: 'https://example.com/story',
    source: 'Local Press',
    publishedAt: '2026-04-12',
    importMeta: { lastAttemptTs: '1000', lastSuccessTs: '1000', status: 'imported' },
  });

  const published = model.applySectionPublish(record, ['news']);

  assert.equal(record.liveContent.news.items.length, 0);
  assert.equal(published.liveContent.news.items.length, 1);
  assert.equal(model.validateNewsSection(published.liveContent.news).valid, true);
});

test('landing model hours rows html uses injected handler names instead of app globals', () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/model.js',
  ]);
  const model = sandbox.__HF_LANDING_MODULES__.createLandingModel();
  const restaurants = model.getConstants().RESTAURANTS;
  const hours = model.createDefaultRecord().draftContent.hours;

  hours.restaurants[restaurants.LEROYS.id].days.wed = {
    closed: false,
    open: '16:00',
    close: '23:00',
  };

  const genericHtml = model.renderHoursRowsHtml(
    hours,
    restaurants.LEROYS.id,
    restaurants.LEROYS.name,
    { setFieldHandlerName: 'handleHourChange' }
  );
  const noHandlerHtml = model.renderHoursRowsHtml(
    hours,
    restaurants.LEROYS.id,
    restaurants.LEROYS.name
  );

  assert.match(genericHtml, /onchange="handleHourChange\(/);
  assert.doesNotMatch(genericHtml, /setLandingHoursField\(/);
  assert.doesNotMatch(noHandlerHtml, /onchange="/);
});
