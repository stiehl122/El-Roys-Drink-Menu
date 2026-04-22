const assert = require('node:assert/strict');
const test = require('node:test');

const { createDocument, createElement, loadSandboxWithScripts } = require('../helpers/runtime.cjs');

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

test('landing root renderer service controls root fallback and review carousel state', () => {
  const document = createDocument();
  const shellEl = document._registerElement('landing-root-shell', createElement('main', 'landing-root-shell'));
  const fallbackEl = document._registerElement('landing-root-fallback', createElement('div', 'landing-root-fallback'));
  const dotNavEl = createElement('nav');
  const eventsSectionEl = document._registerElement('events', createElement('section', 'events'));
  const newsSectionEl = document._registerElement('news', createElement('section', 'news'));
  const reviewsSectionEl = document._registerElement('reviews', createElement('section', 'reviews'));
  const reviewsControlsEl = document._registerElement('landing-reviews-controls', createElement('div', 'landing-reviews-controls'));
  const reviewsEmptyEl = document._registerElement('landing-reviews-empty', createElement('div', 'landing-reviews-empty'));
  const eventsEmptyEl = document._registerElement('landing-events-empty', createElement('div', 'landing-events-empty'));
  const newsEmptyEl = document._registerElement('landing-news-empty', createElement('div', 'landing-news-empty'));
  const eventsListEl = document._registerElement('landing-events-list', createElement('div', 'landing-events-list'));
  const newsListEl = document._registerElement('landing-news-list', createElement('div', 'landing-news-list'));
  const reviewsDotsEl = document._registerElement('landing-reviews-dots', createElement('div', 'landing-reviews-dots'));
  const leroysHeroStatusEl = document._registerElement('landing-hero-status-leroys', createElement('div', 'landing-hero-status-leroys'));
  const leroysHoursListEl = document._registerElement('landing-hours-list-leroys', createElement('div', 'landing-hours-list-leroys'));
  const reviewPairEls = [createElement('article'), createElement('article')];
  const reviewDotEls = [createElement('button'), createElement('button')];
  document._registerSelector('.landing-dot-nav', dotNavEl);
  document._registerSelector('[data-landing-dot="events"]', createElement('button'));
  document._registerSelector('[data-landing-dot="news"]', createElement('button'));
  document._registerSelector('[data-landing-dot="reviews"]', createElement('button'));
  document._registerElement('landing-reviews-list', createElement('div', 'landing-reviews-list'));
  document._registerElement('landing-hours-today-leroys', createElement('div', 'landing-hours-today-leroys'));
  document._registerElement('landing-hours-today-elroys', createElement('div', 'landing-hours-today-elroys'));
  document._registerElement('landing-hero-status-elroys', createElement('div', 'landing-hero-status-elroys'));
  document._registerElement('landing-hours-list-elroys', createElement('div', 'landing-hours-list-elroys'));
  document._registerSelector('[data-landing-review-pair]', reviewPairEls);
  document._registerSelector('.landing-review-dot', reviewDotEls);

  const sandbox = loadSandboxWithScripts([
    'core/landing/root-renderer.js',
  ], { document });

  const rootRecord = {
    id: 'root',
    liveContent: {
      hours: { restaurants: {} },
      events: { items: [] },
      news: { items: [] },
      reviews: { restaurants: {} },
    },
  };
  let reviewIndex = 0;
  const syncCalls = [];
  const service = sandbox.__HF_LANDING_MODULES__.createLandingRootRendererService({
    model: {
      normalizeRecord: record => record,
      computeRestaurantStatus: (_section, restaurantId) => ({
        isOpen: restaurantId === 'leroys',
        label: restaurantId === 'leroys' ? 'Open now' : 'Closed for now',
        todayRangeLabel: restaurantId === 'leroys' ? '4 PM - 11 PM' : 'Closed',
        weekRows: [{
          dayKey: 'mon',
          label: 'Monday',
          isToday: true,
          rangeLabel: restaurantId === 'leroys' ? '4 PM - 11 PM' : 'Closed',
        }],
      }),
      getRenderableEvents: () => ([{
        id: 'event-1',
        target: 'both',
        title: 'Trivia Night',
        eventDate: '2026-04-25',
        startTime: '19:00',
        endTime: '21:00',
        body: 'Weekly fun.',
      }]),
      getRenderableNews: () => ([{
        id: 'news-1',
        target: 'both',
        title: 'Big Story',
        href: 'https://example.com/story',
        source: 'Chronicle',
        publishedDate: '2026-04-20',
        body: 'Fresh update.',
      }]),
      buildReviewPairs: () => ([
        {
          leroys: { author: 'Leroy 1', quote: 'Great room.', rating: 5, source: 'Google' },
          elroys: { author: 'El Roy 1', quote: 'Great patio.', rating: 5, source: 'Google' },
        },
        {
          leroys: { author: 'Leroy 2', quote: 'Love it.', rating: 4, source: 'Google' },
          elroys: { author: 'El Roy 2', quote: 'Excellent.', rating: 5, source: 'Google' },
        },
      ]),
      formatDateLabel: value => value === '2026-04-20' ? 'Apr 20' : 'Apr 25',
      parseTimeToMinutes: value => {
        const [hours, minutes] = String(value || '').split(':').map(Number);
        return (hours * 60) + minutes;
      },
      formatMinutes: value => value === 1140 ? '7:00 PM' : '9:00 PM',
      getTargetAccentClass: target => target === 'both' ? 'landing-tag--both' : '',
      getTargetLabel: target => target === 'both' ? 'Both Locations' : target,
    },
    store: {
      getRecord: () => rootRecord,
      getReviewCarouselIndex: () => reviewIndex,
      setReviewCarouselIndex: value => {
        reviewIndex = value;
        return value;
      },
    },
    document,
    restaurants: {
      LEROYS: { id: 'leroys', name: "Leroy's Lounge" },
      ELROYS: { id: 'elroys', name: "El Roy's Cantina" },
    },
    setReviewCarouselHandlerName: 'handleReviewDot',
    hasRootShell: () => true,
    syncLegacyStateFromStore: () => syncCalls.push(reviewIndex),
  });

  service.setFallbackVisible(true);
  assert.equal(shellEl.hidden, true);
  assert.equal(fallbackEl.hidden, false);
  assert.equal(dotNavEl.hidden, true);

  const renderedRecord = service.renderRootPage(rootRecord);

  assert.equal(renderedRecord, rootRecord);
  assert.equal(shellEl.hidden, false);
  assert.equal(fallbackEl.hidden, true);
  assert.equal(dotNavEl.hidden, false);
  assert.equal(eventsSectionEl.hidden, false);
  assert.equal(newsSectionEl.hidden, false);
  assert.equal(reviewsSectionEl.hidden, false);
  assert.equal(eventsEmptyEl.hidden, true);
  assert.equal(newsEmptyEl.hidden, true);
  assert.equal(reviewsEmptyEl.hidden, true);
  assert.equal(reviewsControlsEl.hidden, false);
  assert.equal(eventsListEl.innerHTML.includes('Trivia Night'), true);
  assert.equal(eventsListEl.innerHTML.includes('Apr 25'), true);
  assert.equal(eventsListEl.innerHTML.includes('7:00 PM - 9:00 PM'), true);
  assert.equal(newsListEl.innerHTML.includes('Big Story'), true);
  assert.equal(newsListEl.innerHTML.includes('Read Story'), true);
  assert.equal(reviewsDotsEl.innerHTML.includes('onclick="handleReviewDot(1)"'), true);
  assert.equal(leroysHeroStatusEl.textContent, 'Open now');
  assert.equal(leroysHoursListEl.innerHTML.includes('4 PM - 11 PM'), true);
  assert.equal(reviewIndex, 0);
  assert.equal(syncCalls.length >= 1, true);

  service.setReviewCarouselIndex(1);
  assert.equal(reviewIndex, 1);
  assert.equal(reviewPairEls[0].classList.contains('is-active'), false);
  assert.equal(reviewPairEls[1].classList.contains('is-active'), true);
  assert.equal(reviewDotEls[0].classList.contains('is-active'), false);
  assert.equal(reviewDotEls[1].classList.contains('is-active'), true);

  service.stepReviewCarousel(-1);
  assert.equal(reviewIndex, 0);
  assert.equal(reviewPairEls[0].classList.contains('is-active'), true);
  assert.equal(reviewPairEls[1].classList.contains('is-active'), false);
  assert.equal(reviewDotEls[0].classList.contains('is-active'), true);
  assert.equal(reviewDotEls[1].classList.contains('is-active'), false);
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
  const leakedRecord = store.getRecord();
  leakedRecord.draftContent.overview.heroTitle = 'leaked mutation';
  assert.equal(store.getRecord().draftContent.overview.heroTitle || '', '');
  const updatedRecord = store.updateRecord(nextRecord => {
    nextRecord.draftContent.overview.heroTitle = 'owned mutation';
  }, { dirty: true, loadScope: 'draft' });
  assert.equal(updatedRecord.draftContent.overview.heroTitle, 'owned mutation');
  assert.equal(store.getRecord().draftContent.overview.heroTitle, 'owned mutation');
  assert.equal(store.hasLoaded({ includeDraft: true }), true);
  assert.equal(store.getLoadScope(), 'draft');
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

  store.setRecord(model.createDefaultRecord(), { dirty: false, loaded: true, loadScope: 'live' });
  const liveThenDraft = await service.ensureLoaded({ includeDraft: true });
  assert.equal(fetchCalls, 2);
  assert.equal(liveThenDraft.draftContent.overview.heroTitle, 'Loaded draft');

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

test('landing admin workspace service updates hours without full rerender and refreshes overview state', () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/admin-workspace.js',
  ]);
  const accessLog = [];
  let record = {
    id: 'root',
    draftContent: {
      overview: {},
      hours: { restaurants: { leroys: { days: { wed: { closed: true, open: '', close: '' } } } } },
      events: { items: [] },
      news: { items: [] },
      reviews: { restaurants: {} },
    },
    liveContent: {
      overview: {},
      hours: { restaurants: { leroys: { days: { wed: { closed: true, open: '', close: '' } } } } },
      events: { items: [] },
      news: { items: [] },
      reviews: { restaurants: {} },
    },
    draftSavedTs: '',
    livePublishedTs: '',
  };
  const elements = new Map();
  const document = {
    getElementById(id) {
      accessLog.push(id);
      if (!elements.has(id)) elements.set(id, createElement('div', id));
      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    },
  };
  const service = sandbox.__HF_LANDING_MODULES__.createLandingAdminWorkspaceService({
    model: {
      normalizeTimeValue: value => value,
    },
    store: {
      getRecord: () => record,
      setRecord: nextRecord => {
        record = nextRecord;
        return record;
      },
      updateRecord: mutator => {
        const nextRecord = JSON.parse(JSON.stringify(record));
        mutator(nextRecord);
        record = nextRecord;
        return record;
      },
      isDirty: () => true,
      getLoadError: () => '',
      getActivePanel: () => 'landing-admin-panel-overview',
      hasLoaded: () => true,
    },
    dataService: {
      ensureLoaded: async () => record,
      saveDraft: async () => record,
      publishSections: async () => record,
    },
    document,
    hasAdminShell: () => true,
    syncLegacyStateFromStore: () => record,
    getSectionFilter: () => ({ showArchived: false }),
    getVisibleItems: items => items,
    sortEvents: items => items,
    sortNews: items => items,
    sortReviews: items => items,
    renderEventCardHtml: () => '',
    renderNewsCardHtml: () => '',
    renderReviewCardHtml: () => '',
    renderHoursRowsHtml: () => '',
    knownRestaurants: () => [],
    restaurants: {},
    getTargetAccentClass: () => '',
    getSectionStatus: () => ({ sectionId: 'hours', label: 'Hours', hasDraftDiff: true, isValid: true, issues: [] }),
    getDraftDiffSectionIds: () => ['hours'],
    formatTimestampLabel: () => 'Now',
    computeStatusForRestaurant: () => ({ label: 'Closed for now' }),
    syncHoursDraftFromDom: currentRecord => currentRecord,
    createDefaultRecord: () => record,
    normalizeRecord: value => value,
    validateEventsSection: () => ({ valid: true, issues: [] }),
    validateNewsSection: () => ({ valid: true, issues: [] }),
    validateReviewsSection: () => ({ valid: true, issues: [] }),
    getHoursSectionValidation: () => ({ valid: true, issues: [] }),
    sectionOrder: ['overview', 'hours', 'events', 'news', 'reviews'],
    setPanelBadge: () => {},
    createDefaultHoursRestaurant: () => ({ days: {} }),
    createDefaultDay: () => ({ closed: true, open: '', close: '' }),
    normalizeDay: day => day,
  });

  service.setHoursField('leroys', 'wed', 'open', '16:00');

  assert.equal(record.draftContent.hours.restaurants.leroys.days.wed.open, '16:00');
  assert.equal(accessLog.includes('landing-overview-root-status'), true);
  assert.equal(accessLog.includes('landing-hours-issues'), true);
  assert.equal(accessLog.includes('landing-save-draft-btn'), true);
  assert.equal(accessLog.includes('landing-admin-hours-grid'), false);
  assert.equal(accessLog.includes('landing-events-panel-body'), false);
});

test('landing admin workspace service imports news drafts through its request/import path', async () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/admin-workspace.js',
  ]);
  let record = {
    id: 'root',
    draftContent: {
      overview: {},
      hours: { restaurants: {} },
      events: { items: [] },
      news: { items: [] },
      reviews: { restaurants: {} },
    },
    liveContent: {
      overview: {},
      hours: { restaurants: {} },
      events: { items: [] },
      news: { items: [] },
      reviews: { restaurants: {} },
    },
    draftSavedTs: '',
    livePublishedTs: '',
  };
  const targetSelect = createElement('select', 'landing-news-import-target');
  targetSelect.value = 'both';
  const urlInput = createElement('input', 'landing-news-import-url');
  urlInput.value = 'https://example.com/story';
  const toastLog = [];
  const service = sandbox.__HF_LANDING_MODULES__.createLandingAdminWorkspaceService({
    model: {
      createDefaultNewsItem: () => ({
        id: 'news-1',
        target: 'both',
        title: '',
        body: '',
        href: '',
        source: '',
        publishedDate: '',
        imageUrl: '',
        importMeta: {},
      }),
      normalizeNewsItem: value => value,
      normalizeImportMeta: value => value,
      normalizeTarget: value => value,
    },
    store: {
      getRecord: () => record,
      setRecord: nextRecord => {
        record = nextRecord;
        return record;
      },
      updateRecord: mutator => {
        const nextRecord = JSON.parse(JSON.stringify(record));
        mutator(nextRecord);
        record = nextRecord;
        return record;
      },
      isDirty: () => true,
      getLoadError: () => '',
      getActivePanel: () => 'landing-admin-panel-overview',
      hasLoaded: () => false,
    },
    dataService: {
      ensureLoaded: async () => record,
      saveDraft: async () => record,
      publishSections: async () => record,
    },
    document: {
      getElementById(id) {
        if (id === 'landing-news-import-target') return targetSelect;
        if (id === 'landing-news-import-url') return urlInput;
        return createElement('div', id);
      },
      querySelectorAll() {
        return [];
      },
    },
    hasAdminShell: () => false,
    syncLegacyStateFromStore: () => record,
    createDefaultRecord: () => record,
    normalizeRecord: value => value || record,
    landingTargetBoth: 'both',
    landingImportStatusImported: 'imported',
    postApiJson: async () => ({
      ok: true,
      payload: {
        status: 'imported',
        sourceUrl: 'https://example.com/story',
        href: 'https://example.com/story',
        title: 'Story',
        source: 'Chronicle',
        publishedDate: '2026-04-01',
      },
    }),
    getAuthorizedApiHeaders: () => ({}),
    getCurrentUser: () => ({ accessToken: 'token' }),
    showToast: (message, tone) => toastLog.push([message, tone]),
  });

  await service.importNewsDraft();

  assert.equal(record.draftContent.news.items.length, 1);
  assert.equal(record.draftContent.news.items[0].title, 'Story');
  assert.equal(urlInput.value, '');
  assert.equal(toastLog[0][1], 'success');
});

test('landing admin workspace service saves drafts and publishes selected sections', async () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/admin-workspace.js',
  ]);
  let record = {
    id: 'root',
    draftContent: { overview: {}, hours: { restaurants: {} }, events: { items: [] }, news: { items: [] }, reviews: { restaurants: {} } },
    liveContent: { overview: {}, hours: { restaurants: {} }, events: { items: [] }, news: { items: [] }, reviews: { restaurants: {} } },
    draftSavedTs: '',
    livePublishedTs: '',
  };
  const modalEl = createElement('div', 'landing-publish-modal');
  modalEl.classList = { add() {}, remove() {} };
  const listEl = createElement('div', 'landing-publish-list');
  const issuesEl = createElement('div', 'landing-publish-issues');
  const confirmButton = createElement('button', 'landing-publish-confirm-btn');
  const calls = [];
  const service = sandbox.__HF_LANDING_MODULES__.createLandingAdminWorkspaceService({
    model: {},
    store: {
      getRecord: () => record,
      setRecord: nextRecord => {
        record = nextRecord;
        return record;
      },
      updateRecord: mutator => {
        const nextRecord = JSON.parse(JSON.stringify(record));
        mutator(nextRecord);
        record = nextRecord;
        return record;
      },
      isDirty: () => false,
      getLoadError: () => '',
      getActivePanel: () => 'landing-admin-panel-overview',
      hasLoaded: () => true,
    },
    dataService: {
      ensureLoaded: async () => record,
      saveDraft: async currentRecord => {
        calls.push(['saveDraft', currentRecord.id]);
        return currentRecord;
      },
      publishSections: async (currentRecord, sectionIds) => {
        calls.push(['publishSections', sectionIds]);
        return currentRecord;
      },
    },
    document: {
      getElementById(id) {
        if (id === 'landing-publish-modal') return modalEl;
        if (id === 'landing-publish-list') return listEl;
        if (id === 'landing-publish-issues') return issuesEl;
        if (id === 'landing-publish-confirm-btn') return confirmButton;
        return createElement('div', id);
      },
      querySelectorAll(selector) {
        if (selector === '[data-landing-publish-section]:checked') {
          return [{
            getAttribute(name) {
              return name === 'data-landing-publish-section' ? 'hours' : '';
            },
          }];
        }
        return [];
      },
    },
    hasAdminShell: () => true,
    hasRootShell: () => true,
    syncLegacyStateFromStore: () => record,
    syncHoursDraftFromDom: currentRecord => currentRecord,
    createDefaultRecord: () => record,
    normalizeRecord: value => value || record,
    getSectionStatus: () => ({ sectionId: 'hours', label: 'Hours', hasDraftDiff: true, isValid: true, issues: [] }),
    getDraftDiffSectionIds: () => ['hours'],
    formatTimestampLabel: () => 'Now',
    computeStatusForRestaurant: () => ({ label: 'Closed for now' }),
    sectionOrder: ['hours'],
    renderRootPage: currentRecord => calls.push(['renderRootPage', currentRecord.id]),
    showToast: (message, tone) => calls.push(['toast', tone, message]),
  });

  await service.saveDraft();
  service.renderPublishModal();
  await service.publishSections();

  assert.equal(listEl.innerHTML.includes('Hours'), true);
  assert.equal(confirmButton.disabled, false);
  assert.equal(calls.some(entry => entry[0] === 'saveDraft'), true);
  assert.equal(calls.some(entry => entry[0] === 'publishSections'), true);
  assert.equal(calls.some(entry => entry[0] === 'renderRootPage'), true);
});

test('landing model factory publishes selected draft sections without mutating live state', () => {
  const sandbox = loadSandboxWithScripts([
    'core/landing/model.js',
  ]);
  const model = sandbox.__HF_LANDING_MODULES__.createLandingModel();
  assert.equal(typeof model.createDefaultImportMeta, 'function');
  assert.equal(typeof model.createDefaultContent, 'function');
  assert.equal(typeof model.normalizeTimestamp, 'function');
  assert.equal(typeof model.getDefaultFilters, 'function');
  assert.equal(typeof model.normalizeDay, 'function');
  assert.equal(typeof model.normalizeHoursRestaurant, 'function');
  assert.equal(typeof model.normalizeEventItem, 'function');
  assert.equal(typeof model.normalizeNewsItem, 'function');
  assert.equal(typeof model.normalizeReviewItem, 'function');
  assert.equal(typeof model.normalizeContent, 'function');
  assert.equal(typeof model.normalizeFilters, 'function');
  assert.equal(typeof model.parseTimeToMinutes, 'function');
  assert.equal(typeof model.formatMinutes, 'function');
  assert.equal(typeof model.getTimeSelectOptions, 'function');
  assert.equal(typeof model.renderTimeSelectOptions, 'function');
  assert.equal(typeof model.isIsoDate, 'function');
  assert.equal(typeof model.formatDateLabel, 'function');
  assert.equal(typeof model.getTargetLabel, 'function');
  assert.equal(typeof model.getTargetAccentClass, 'function');
  assert.equal(typeof model.formatImportStatusLabel, 'function');
  assert.equal(typeof model.formatImportTimestamp, 'function');
  assert.equal(typeof model.isAbsoluteUrl, 'function');
  assert.equal(typeof model.getEventDateRank, 'function');
  assert.equal(typeof model.sortEvents, 'function');
  assert.equal(typeof model.sortNews, 'function');
  assert.equal(typeof model.sortReviews, 'function');
  assert.equal(typeof model.getActiveItems, 'function');
  assert.equal(typeof model.getVisibleItems, 'function');
  assert.equal(typeof model.formatHoursRange, 'function');
  assert.equal(typeof model.getHoursForRestaurant, 'function');
  assert.equal(typeof model.buildWeekRows, 'function');
  assert.equal(typeof model.getDayOffsetKey, 'function');
  assert.equal(typeof model.getRestaurantLocalParts, 'function');
  assert.equal(typeof model.applyHoursFieldDraft, 'function');
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

  const restaurants = model.getConstants().RESTAURANTS;
  const hours = model.createDefaultRecord().draftContent.hours;
  hours.restaurants[restaurants.LEROYS.id].days.fri = {
    closed: false,
    open: '16:00',
    close: '23:30',
  };

  assert.equal(model.parseTimeToMinutes('16:15'), 975);
  assert.equal(JSON.stringify(model.getDefaultFilters()), JSON.stringify({
    events: { showArchived: false },
    news: { showArchived: false },
    reviews: { showArchived: false },
  }));
  assert.equal(JSON.stringify(model.normalizeFilters({ news: { showArchived: true } })), JSON.stringify({
    events: { showArchived: false },
    news: { showArchived: true },
    reviews: { showArchived: false },
  }));
  assert.equal(model.formatMinutes(975), '4:15 PM');
  assert.equal(model.getTimeSelectOptions()[0].value, '00:00');
  assert.match(model.renderTimeSelectOptions('16:15', 'Start time'), /option value="16:15" selected/);
  assert.equal(model.isIsoDate('2026-04-12'), true);
  assert.equal(model.formatDateLabel('2026-04-12', { short: true, year: false }), 'Apr 12');
  assert.equal(model.getTargetLabel(restaurants.LEROYS.id), "Leroy's Lounge");
  assert.equal(model.getTargetAccentClass(restaurants.ELROYS.id), 'landing-tag--elroys');
  assert.equal(model.formatImportStatusLabel('failed'), 'Needs Repair');
  assert.equal(model.formatImportTimestamp({ lastAttemptTs: '1710000000000' }).startsWith('Tried '), true);
  assert.equal(model.isAbsoluteUrl('https://example.com/story'), true);
  assert.equal(model.getEventDateRank('not-a-date'), Number.MAX_SAFE_INTEGER);
  assert.deepEqual(
    model.sortEvents([
      { title: 'B', eventDate: '2026-06-01', startTime: '18:00' },
      { title: 'A', eventDate: '2026-05-01', startTime: '18:00' },
    ]).map(item => item.title),
    ['A', 'B']
  );
  assert.deepEqual(
    model.sortNews([
      { title: 'Older', publishedDate: '2026-04-01', updatedAt: '1' },
      { title: 'Newer', publishedDate: '2026-04-02', updatedAt: '1' },
    ]).map(item => item.title),
    ['Newer', 'Older']
  );
  assert.deepEqual(
    model.sortReviews([
      { author: 'Older', updatedAt: '1', importMeta: { lastSuccessTs: '10' } },
      { author: 'Newer', updatedAt: '1', importMeta: { lastSuccessTs: '20' } },
    ]).map(item => item.author),
    ['Newer', 'Older']
  );
  assert.equal(model.getActiveItems([{ archived: false }, { archived: true }]).length, 1);
  assert.equal(model.getVisibleItems([{ archived: false }, { archived: true }], true).length, 2);
  assert.equal(model.formatHoursRange(hours.restaurants[restaurants.LEROYS.id].days.fri), '4 PM - 11:30 PM');
  assert.equal(model.getHoursForRestaurant(hours, restaurants.LEROYS.id).days.fri.open, '16:00');
  assert.equal(model.getDayOffsetKey('fri', 1), 'sat');
  const hoursDraftRecord = model.applyHoursFieldDraft(model.createDefaultRecord(), [
    { restaurantId: restaurants.LEROYS.id, dayKey: 'fri', field: 'open', value: '16:00' },
    { restaurantId: restaurants.LEROYS.id, dayKey: 'fri', field: 'close', value: '23:30' },
    { restaurantId: restaurants.LEROYS.id, dayKey: 'fri', field: 'closed', value: false },
  ]);
  assert.equal(hoursDraftRecord.draftContent.hours.restaurants[restaurants.LEROYS.id].days.fri.open, '16:00');
  assert.equal(
    JSON.stringify(model.buildWeekRows(hours, restaurants.LEROYS.id, 'fri').find(row => row.dayKey === 'fri')),
    JSON.stringify({
      dayKey: 'fri',
      label: 'Friday',
      isToday: true,
      rangeLabel: '4 PM - 11:30 PM',
    })
  );
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

test('app landing helpers delegate through instantiated landing services', () => {
  const delegationLog = [];
  const defaultFilters = {
    events: { showArchived: false },
    news: { showArchived: true },
    reviews: { showArchived: false },
  };
  const normalizedFilters = {
    events: { showArchived: true },
    news: { showArchived: false },
    reviews: { showArchived: true },
  };
  const validationResult = { valid: false, issues: ['delegated validation'] };
  const rootRecord = {
    id: 'root',
    draftContent: { hours: { restaurants: {} }, overview: {}, events: { items: [] }, news: { items: [] }, reviews: { restaurants: {} } },
    liveContent: { hours: { restaurants: {} }, overview: {}, events: { items: [] }, news: { items: [] }, reviews: { restaurants: {} } },
    draftSavedTs: '',
    livePublishedTs: '',
  };
  const statusRecord = {
    ...rootRecord,
  };
  const validationRecord = {
    ...statusRecord,
    draftContent: {
      ...statusRecord.draftContent,
      hours: {
        restaurants: {
          'restaurant-1': {
            days: {
              fri: { closed: false, open: '16:00', close: '23:30' },
            },
          },
        },
      },
    },
  };
  const storeInstance = {
    getRecord() { return statusRecord; },
    isDirty() { return false; },
    getLoadPromise() { return null; },
    getLoadError() { return ''; },
    getActivePanel() { return 'landing-admin-panel-overview'; },
    getFilters() { delegationLog.push(['store.getFilters']); return defaultFilters; },
    getReviewCarouselIndex() { return 0; },
    setFilters(nextFilters) { delegationLog.push(['store.setFilters', nextFilters]); return nextFilters; },
    setRecord() {},
    setDirty() { return false; },
    setLoadPromise() { return null; },
    setLoadError() { return ''; },
    setActivePanel() { return 'landing-admin-panel-overview'; },
    setReviewCarouselIndex() { return 0; },
  };
  let modelInstance;
  const rootRendererLog = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_LANDING_MODULES__: {
      createLandingModel(options) {
        delegationLog.push(['createLandingModel', options]);
        modelInstance = {
          getConstants() {
            delegationLog.push(['model.getConstants']);
            return {
              LANDING_PAGE_STATE_ID: 'root',
              LANDING_PAGE_SECTION_ORDER: ['overview', 'hours', 'events', 'news', 'reviews'],
              LANDING_PAGE_SECTION_LABELS: {
                overview: 'Overview',
                hours: 'Hours',
                events: 'Events',
                news: 'News',
                reviews: 'Reviews',
              },
              LANDING_DAY_ORDER: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
              LANDING_DAY_LABELS: {
                mon: 'Monday',
                tue: 'Tuesday',
                wed: 'Wednesday',
                thu: 'Thursday',
                fri: 'Friday',
                sat: 'Saturday',
                sun: 'Sunday',
              },
              LANDING_TARGET_BOTH: 'both',
              LANDING_IMPORT_STATUS_IDLE: 'idle',
              LANDING_IMPORT_STATUS_IMPORTED: 'imported',
              LANDING_IMPORT_STATUS_PARTIAL: 'partial',
              LANDING_IMPORT_STATUS_FAILED: 'failed',
              LANDING_ITEM_STATUS_LIVE: 'Live',
              LANDING_ITEM_STATUS_DRAFT: 'Draft',
              LANDING_ITEM_STATUS_MISSING: 'Missing Fields',
              LANDING_ITEM_STATUS_ARCHIVED: 'ARCHIVED',
              LANDING_FILTER_STORAGE_KEY: 'hf_landing_admin_filters',
            };
          },
          getDefaultFilters() {
            delegationLog.push(['model.getDefaultFilters']);
            return defaultFilters;
          },
          normalizeFilters(raw) {
            delegationLog.push(['model.normalizeFilters', raw]);
            return normalizedFilters;
          },
          getDayOffsetKey(dayKey, offset) {
            delegationLog.push(['model.getDayOffsetKey', dayKey, offset]);
            return `delegated-${dayKey}-${offset}`;
          },
          getRestaurantLocalParts(now, timeZone) {
            delegationLog.push(['model.getRestaurantLocalParts', now, timeZone]);
            return { dayKey: 'thu', minutes: 615 };
          },
          getSectionValidation(sectionId, record) {
            delegationLog.push(['model.getSectionValidation', sectionId, record]);
            return validationResult;
          },
          applyHoursFieldDraft(record, fieldStates) {
            delegationLog.push(['model.applyHoursFieldDraft', record, fieldStates]);
            return validationRecord;
          },
          createDefaultRecord() { return statusRecord; },
          normalizeRecord(record) { return record || statusRecord; },
          landingSectionHasDiff(sectionId, record) {
            delegationLog.push(['model.landingSectionHasDiff', sectionId, record]);
            return sectionId === 'hours';
          },
        };
        return modelInstance;
      },
      createLandingStore(options) {
        delegationLog.push(['createLandingStore', options]);
        return storeInstance;
      },
      createLandingDataService(options) {
        delegationLog.push(['createLandingDataService', options]);
        return { options };
      },
      createLandingRootRendererService(options) {
        rootRendererLog.push(['createLandingRootRendererService', options]);
        return {
          setSectionVisible(sectionId, visible) {
            rootRendererLog.push(['root.setSectionVisible', sectionId, visible]);
          },
          renderRootEvents(section) {
            rootRendererLog.push(['root.renderRootEvents', section]);
          },
          renderRootNews(section) {
            rootRendererLog.push(['root.renderRootNews', section]);
          },
          renderRootReviews(section) {
            rootRendererLog.push(['root.renderRootReviews', section]);
          },
          renderRootHours(section) {
            rootRendererLog.push(['root.renderRootHours', section]);
          },
          setReviewCarouselIndex(nextIndex) {
            rootRendererLog.push(['root.setReviewCarouselIndex', nextIndex]);
            return nextIndex;
          },
          stepReviewCarousel(direction) {
            rootRendererLog.push(['root.stepReviewCarousel', direction]);
            return direction;
          },
          setFallbackVisible(visible) {
            rootRendererLog.push(['root.setFallbackVisible', visible]);
          },
          renderRootPage(record) {
            rootRendererLog.push(['root.renderRootPage', record]);
            return record;
          },
        };
      },
      createLandingAdminWorkspaceService(options) {
        delegationLog.push(['createLandingAdminWorkspaceService', options]);
        return {
          renderEventsPanel(record) { delegationLog.push(['admin.renderEventsPanel', record]); },
          renderNewsPanel(record) { delegationLog.push(['admin.renderNewsPanel', record]); },
          renderReviewsPanel(record) { delegationLog.push(['admin.renderReviewsPanel', record]); },
          renderOverview(record) { delegationLog.push(['admin.renderOverview', record]); },
          renderHoursValidationState(record) { delegationLog.push(['admin.renderHoursValidationState', record]); },
          updateToolbar(record) { delegationLog.push(['admin.updateToolbar', record]); },
          renderHoursPanel(record) { delegationLog.push(['admin.renderHoursPanel', record]); },
          renderWorkspace(options) { delegationLog.push(['admin.renderWorkspace', options]); },
          setHoursField(...args) { delegationLog.push(['admin.setHoursField', ...args]); },
          updateDraftRecord(mutator, options) { delegationLog.push(['admin.updateDraftRecord', typeof mutator, options]); return statusRecord; },
          addEventDraft() { delegationLog.push(['admin.addEventDraft']); },
          updateEventField(...args) { delegationLog.push(['admin.updateEventField', ...args]); },
          toggleEventArchived(...args) { delegationLog.push(['admin.toggleEventArchived', ...args]); },
          updateNewsField(...args) { delegationLog.push(['admin.updateNewsField', ...args]); },
          toggleNewsArchived(...args) { delegationLog.push(['admin.toggleNewsArchived', ...args]); },
          updateReviewField(...args) { delegationLog.push(['admin.updateReviewField', ...args]); },
          toggleReviewArchived(...args) { delegationLog.push(['admin.toggleReviewArchived', ...args]); },
          toggleSectionArchivedFilter(...args) { delegationLog.push(['admin.toggleSectionArchivedFilter', ...args]); },
          handleNewsImportPaste() { delegationLog.push(['admin.handleNewsImportPaste']); },
          handleReviewImportPaste(...args) { delegationLog.push(['admin.handleReviewImportPaste', ...args]); },
          importNewsDraft() { delegationLog.push(['admin.importNewsDraft']); },
          refreshNewsItem(...args) { delegationLog.push(['admin.refreshNewsItem', ...args]); },
          importReviewDraft(...args) { delegationLog.push(['admin.importReviewDraft', ...args]); },
          refreshReviewItem(...args) { delegationLog.push(['admin.refreshReviewItem', ...args]); },
          saveDraft() { delegationLog.push(['admin.saveDraft']); },
          renderPublishModal() { delegationLog.push(['admin.renderPublishModal']); },
          openPublishModal() { delegationLog.push(['admin.openPublishModal']); },
          closePublishModal() { delegationLog.push(['admin.closePublishModal']); },
          publishSections() { delegationLog.push(['admin.publishSections']); },
        };
      },
    },
  });
  const openField = createElement('select');
  openField.value = '16:00';
  openField.setAttribute('data-landing-hours-field', 'open');
  openField.setAttribute('data-landing-hours-restaurant', 'restaurant-1');
  openField.setAttribute('data-landing-hours-day', 'fri');
  const closeField = createElement('select');
  closeField.value = '23:30';
  closeField.setAttribute('data-landing-hours-field', 'close');
  closeField.setAttribute('data-landing-hours-restaurant', 'restaurant-1');
  closeField.setAttribute('data-landing-hours-day', 'fri');
  sandbox.document._registerSelector('[data-landing-hours-field]', [openField, closeField]);

  assert.deepEqual(sandbox.getLandingDefaultFilters(), defaultFilters);
  assert.deepEqual(sandbox.normalizeLandingFilters({ events: { showArchived: true } }), normalizedFilters);
  assert.equal(sandbox.getLandingDayOffsetKey('fri', 2), 'delegated-fri-2');
  assert.deepEqual(sandbox.getRestaurantLocalParts(1234, 'America/Chicago'), { dayKey: 'thu', minutes: 615 });
  assert.deepEqual(sandbox.getLandingSectionValidation('hours', statusRecord), validationResult);
  assert.equal(JSON.stringify(sandbox.getLandingSectionStatus('hours', statusRecord)), JSON.stringify({
    sectionId: 'hours',
    label: 'Hours',
    hasDraftDiff: true,
    isValid: false,
    issues: ['delegated validation'],
  }));
  sandbox.renderLandingEventsPanel(statusRecord);
  sandbox.renderLandingNewsPanel(statusRecord);
  sandbox.renderLandingReviewsPanel(statusRecord);
  sandbox.renderLandingOverview(statusRecord);
  sandbox.renderLandingHoursValidationState(statusRecord);
  sandbox.updateLandingAdminToolbar(statusRecord);
  sandbox.renderLandingHoursPanel(statusRecord);
  sandbox.renderLandingAdminWorkspace({ forceReload: true });
  sandbox.setLandingHoursField('leroys', 'fri', 'open', '16:00');
  sandbox.updateLandingDraftRecord(() => {}, { rerender: false });
  sandbox.addLandingEventDraft();
  sandbox.updateLandingEventField('event-1', 'title', 'Trivia');
  sandbox.toggleLandingEventArchived('event-1', true);
  sandbox.updateLandingNewsField('news-1', 'title', 'Story');
  sandbox.toggleLandingNewsArchived('news-1', true);
  sandbox.updateLandingReviewField('leroys', 'review-1', 'quote', 'Great');
  sandbox.toggleLandingReviewArchived('leroys', 'review-1', true);
  sandbox.toggleLandingSectionArchivedFilter('news', true);
  sandbox.handleLandingNewsImportPaste();
  sandbox.handleLandingReviewImportPaste('leroys');
  sandbox.importLandingNewsDraft();
  sandbox.refreshLandingNewsItem('news-1');
  sandbox.importLandingReviewDraft('leroys');
  sandbox.refreshLandingReviewItem('leroys', 'review-1');
  sandbox.saveLandingPageDraft();
  sandbox.renderLandingPublishModal();
  sandbox.openLandingPublishModal();
  sandbox.closeLandingPublishModal();
  sandbox.publishLandingPageSections();
  sandbox.renderLandingRootEvents(rootRecord.liveContent.events);
  sandbox.renderLandingRootNews(rootRecord.liveContent.news);
  sandbox.renderLandingRootReviews(rootRecord.liveContent.reviews);
  sandbox.renderLandingRootHours(rootRecord.liveContent.hours);
  sandbox.setLandingRootSectionVisible('news', false);
  sandbox.setLandingReviewCarouselIndex(2);
  sandbox.stepLandingReviewCarousel(-1);
  sandbox.setLandingRootFallbackVisible(true);
  sandbox.renderLandingRootPage(rootRecord);

  const createStoreCall = delegationLog.find(entry => entry[0] === 'createLandingStore');
  assert.deepEqual(createStoreCall[1].model, modelInstance);
  assert.deepEqual(createStoreCall[1].defaultFilters, defaultFilters);
  const createRootRendererCall = rootRendererLog.find(entry => entry[0] === 'createLandingRootRendererService');
  assert.deepEqual(createRootRendererCall[1].model, modelInstance);
  assert.deepEqual(createRootRendererCall[1].store, storeInstance);
  assert.equal(typeof createRootRendererCall[1].hasRootShell, 'function');
  assert.equal(typeof createRootRendererCall[1].syncLegacyStateFromStore, 'function');
  assert.equal(createRootRendererCall[1].setReviewCarouselHandlerName, 'setLandingReviewCarouselIndex');
  assert.equal(
    delegationLog.some(entry => entry[0] === 'createLandingAdminWorkspaceService'),
    true
  );
  assert.equal(
    delegationLog.filter(entry => entry[0] === 'model.getSectionValidation' && entry[1] === 'hours').length >= 2,
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.renderWorkspace' && entry[1].forceReload === true),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.setHoursField' && entry[1] === 'leroys' && entry[2] === 'fri' && entry[3] === 'open'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.updateDraftRecord' && entry[1] === 'function'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.addEventDraft'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.updateEventField' && entry[1] === 'event-1'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.toggleEventArchived' && entry[1] === 'event-1'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.updateNewsField' && entry[1] === 'news-1'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.toggleNewsArchived' && entry[1] === 'news-1'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.updateReviewField' && entry[1] === 'leroys' && entry[2] === 'review-1'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.toggleReviewArchived' && entry[1] === 'leroys' && entry[2] === 'review-1'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.toggleSectionArchivedFilter' && entry[1] === 'news'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.handleNewsImportPaste'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.handleReviewImportPaste' && entry[1] === 'leroys'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.importNewsDraft'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.refreshNewsItem' && entry[1] === 'news-1'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.importReviewDraft' && entry[1] === 'leroys'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.refreshReviewItem' && entry[1] === 'leroys' && entry[2] === 'review-1'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.saveDraft'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.renderPublishModal'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.openPublishModal'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.closePublishModal'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'admin.publishSections'),
    true
  );
  assert.equal(
    rootRendererLog.some(entry => entry[0] === 'root.renderRootEvents' && entry[1] === rootRecord.liveContent.events),
    true
  );
  assert.equal(
    rootRendererLog.some(entry => entry[0] === 'root.renderRootNews' && entry[1] === rootRecord.liveContent.news),
    true
  );
  assert.equal(
    rootRendererLog.some(entry => entry[0] === 'root.renderRootReviews' && entry[1] === rootRecord.liveContent.reviews),
    true
  );
  assert.equal(
    rootRendererLog.some(entry => entry[0] === 'root.renderRootHours' && entry[1] === rootRecord.liveContent.hours),
    true
  );
  assert.equal(
    rootRendererLog.some(entry => entry[0] === 'root.setSectionVisible' && entry[1] === 'news' && entry[2] === false),
    true
  );
  assert.equal(
    rootRendererLog.some(entry => entry[0] === 'root.setReviewCarouselIndex' && entry[1] === 2),
    true
  );
  assert.equal(
    rootRendererLog.some(entry => entry[0] === 'root.stepReviewCarousel' && entry[1] === -1),
    true
  );
  assert.equal(
    rootRendererLog.some(entry => entry[0] === 'root.setFallbackVisible' && entry[1] === true),
    true
  );
  assert.equal(
    rootRendererLog.some(entry => entry[0] === 'root.renderRootPage' && entry[1] === rootRecord),
    true
  );
  assert.equal(
    delegationLog.some(entry => (
      entry[0] === 'model.applyHoursFieldDraft' &&
      entry[2].length === 2 &&
      entry[2][0].restaurantId === 'restaurant-1' &&
      entry[2][0].field === 'open'
    )),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'model.getSectionValidation' && entry[1] === 'hours' && entry[2] === validationRecord),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'model.getDayOffsetKey' && entry[1] === 'fri' && entry[2] === 2),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'model.getRestaurantLocalParts' && entry[1] === 1234 && entry[2] === 'America/Chicago'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'model.getDefaultFilters'),
    true
  );
  assert.equal(
    delegationLog.some(entry => entry[0] === 'model.normalizeFilters'),
    true
  );
});
