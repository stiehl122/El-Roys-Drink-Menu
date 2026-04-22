(function bootstrapLandingAdminWorkspaceModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};

  modules.createLandingAdminWorkspaceService = function createLandingAdminWorkspaceService(options = {}) {
    const model = options.model && typeof options.model === 'object' ? options.model : null;
    const store = options.store && typeof options.store === 'object' ? options.store : null;
    const dataService = options.dataService && typeof options.dataService === 'object' ? options.dataService : null;
    const document = options.document || globalScope.document || null;
    const escHtml = typeof options.escHtml === 'function' ? options.escHtml : (value => String(value || ''));
    const now = typeof options.now === 'function' ? options.now : (() => Date.now());
    const showToast = typeof options.showToast === 'function' ? options.showToast : (() => {});
    const hasAdminShell = typeof options.hasAdminShell === 'function' ? options.hasAdminShell : (() => false);
    const hasRootShell = typeof options.hasRootShell === 'function' ? options.hasRootShell : (() => false);
    const focusAdminPanel = typeof options.focusAdminPanel === 'function' ? options.focusAdminPanel : (() => {});
    const syncLegacyStateFromStore = typeof options.syncLegacyStateFromStore === 'function'
      ? options.syncLegacyStateFromStore
      : (() => (store && typeof store.getRecord === 'function' ? store.getRecord() : null));
    const getSectionFilter = typeof options.getSectionFilter === 'function'
      ? options.getSectionFilter
      : (() => ({ showArchived: false }));
    const getVisibleItems = typeof options.getVisibleItems === 'function'
      ? options.getVisibleItems
      : (items => Array.isArray(items) ? items.slice() : []);
    const sortEvents = typeof options.sortEvents === 'function' ? options.sortEvents : (items => Array.isArray(items) ? items.slice() : []);
    const sortNews = typeof options.sortNews === 'function' ? options.sortNews : (items => Array.isArray(items) ? items.slice() : []);
    const sortReviews = typeof options.sortReviews === 'function' ? options.sortReviews : (items => Array.isArray(items) ? items.slice() : []);
    const renderEventCardHtml = typeof options.renderEventCardHtml === 'function' ? options.renderEventCardHtml : (() => '');
    const renderNewsCardHtml = typeof options.renderNewsCardHtml === 'function' ? options.renderNewsCardHtml : (() => '');
    const renderReviewCardHtml = typeof options.renderReviewCardHtml === 'function' ? options.renderReviewCardHtml : (() => '');
    const renderHoursRowsHtml = typeof options.renderHoursRowsHtml === 'function' ? options.renderHoursRowsHtml : (() => '');
    const knownRestaurants = typeof options.knownRestaurants === 'function' ? options.knownRestaurants : (() => []);
    const restaurants = options.restaurants && typeof options.restaurants === 'object' ? options.restaurants : {};
    const getTargetAccentClass = typeof options.getTargetAccentClass === 'function' ? options.getTargetAccentClass : (() => '');
    const getSectionStatus = typeof options.getSectionStatus === 'function'
      ? options.getSectionStatus
      : ((sectionId, record) => {
          const validation = model && typeof model.getSectionValidation === 'function'
            ? model.getSectionValidation(sectionId, record)
            : { valid: true, issues: [] };
          return {
            sectionId,
            label: sectionId,
            hasDraftDiff: false,
            isValid: validation.valid,
            issues: validation.issues || [],
          };
        });
    const getDraftDiffSectionIds = typeof options.getDraftDiffSectionIds === 'function'
      ? options.getDraftDiffSectionIds
      : (() => []);
    const formatTimestampLabel = typeof options.formatTimestampLabel === 'function'
      ? options.formatTimestampLabel
      : (() => 'Not yet');
    const computeStatusForRestaurant = typeof options.computeStatusForRestaurant === 'function'
      ? options.computeStatusForRestaurant
      : (() => ({ label: '' }));
    const syncHoursDraftFromDom = typeof options.syncHoursDraftFromDom === 'function'
      ? options.syncHoursDraftFromDom
      : (record => record);
    const renderRootPage = typeof options.renderRootPage === 'function' ? options.renderRootPage : (() => {});
    const normalizeRecord = typeof options.normalizeRecord === 'function'
      ? options.normalizeRecord
      : (record => (model && typeof model.normalizeRecord === 'function' ? model.normalizeRecord(record) : record));
    const createDefaultRecord = typeof options.createDefaultRecord === 'function'
      ? options.createDefaultRecord
      : (() => (model && typeof model.createDefaultRecord === 'function' ? model.createDefaultRecord() : {}));
    const validateEventsSection = typeof options.validateEventsSection === 'function'
      ? options.validateEventsSection
      : (section => (model && typeof model.validateEventsSection === 'function' ? model.validateEventsSection(section) : { valid: true, issues: [] }));
    const validateNewsSection = typeof options.validateNewsSection === 'function'
      ? options.validateNewsSection
      : (section => (model && typeof model.validateNewsSection === 'function' ? model.validateNewsSection(section) : { valid: true, issues: [] }));
    const validateReviewsSection = typeof options.validateReviewsSection === 'function'
      ? options.validateReviewsSection
      : (section => (model && typeof model.validateReviewsSection === 'function' ? model.validateReviewsSection(section) : { valid: true, issues: [] }));
    const getHoursSectionValidation = typeof options.getHoursSectionValidation === 'function'
      ? options.getHoursSectionValidation
      : ((record) => (model && typeof model.getSectionValidation === 'function' ? model.getSectionValidation('hours', record) : { valid: true, issues: [] }));
    const sectionOrder = Array.isArray(options.sectionOrder) ? options.sectionOrder.slice() : [];
    const setPanelBadge = typeof options.setPanelBadge === 'function' ? options.setPanelBadge : (() => {});
    const landingTargetBoth = options.landingTargetBoth || '';
    const landingImportStatusImported = options.landingImportStatusImported || '';
    const setSectionFilter = typeof options.setSectionFilter === 'function' ? options.setSectionFilter : null;
    const scheduleTask = typeof options.setTimeout === 'function' ? options.setTimeout : globalScope.setTimeout;
    const postApiJson = typeof options.postApiJson === 'function' ? options.postApiJson : null;
    const getAuthorizedApiHeaders = typeof options.getAuthorizedApiHeaders === 'function'
      ? options.getAuthorizedApiHeaders
      : (() => ({}));
    const getCurrentUser = typeof options.getCurrentUser === 'function'
      ? options.getCurrentUser
      : (() => null);

    if (!model || !store || !dataService || !document) {
      return {};
    }

    function getRecord(record) {
      return normalizeRecord(record || store.getRecord() || createDefaultRecord());
    }

    function syncStoreRecord(record, options = {}) {
      const normalized = getRecord(record);
      store.setRecord(normalized, {
        dirty: typeof options.dirty === 'boolean' ? options.dirty : store.isDirty(),
        loadScope: 'draft',
      });
      syncLegacyStateFromStore();
      return normalized;
    }

    function renderEventsPanel(record = store.getRecord()) {
      const normalized = getRecord(record);
      const bodyEl = document.getElementById('landing-events-panel-body');
      const issuesEl = document.getElementById('landing-events-issues');
      const validation = validateEventsSection(normalized.draftContent.events);
      const filter = getSectionFilter('events');
      const visibleItems = getVisibleItems(sortEvents(normalized.draftContent.events.items), filter.showArchived);
      if (bodyEl) {
        bodyEl.innerHTML = `
      <div class="landing-admin-toolbar-row">
        <button type="button" class="btn-small admin-console-primary-btn" onclick="addLandingEventDraft()">Add Event</button>
        <label class="landing-admin-toggle">
          <input type="checkbox" ${filter.showArchived ? 'checked' : ''} onchange="toggleLandingSectionArchivedFilter('events', this.checked)">
          Show archived
        </label>
      </div>
      ${visibleItems.length ? `<div class="landing-admin-editor-list">${visibleItems.map(item => renderEventCardHtml(item, normalized.liveContent.events)).join('')}</div>` : `
        <article class="landing-admin-note">
          <strong>No ${filter.showArchived ? '' : 'active '}events yet.</strong>
          <p>Manual event cards live here. Add a night, tag the room, and publish the full section when it is ready.</p>
        </article>`}
    `;
      }
      if (issuesEl) {
        issuesEl.innerHTML = validation.valid
          ? ''
          : validation.issues.map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`).join('');
      }
      setPanelBadge('events', validation);
      return normalized;
    }

    function renderNewsPanel(record = store.getRecord()) {
      const normalized = getRecord(record);
      const bodyEl = document.getElementById('landing-news-panel-body');
      const issuesEl = document.getElementById('landing-news-issues');
      const validation = validateNewsSection(normalized.draftContent.news);
      const filter = getSectionFilter('news');
      const visibleItems = getVisibleItems(sortNews(normalized.draftContent.news.items), filter.showArchived);
      if (bodyEl) {
        bodyEl.innerHTML = `
      <div class="landing-admin-toolbar-row landing-admin-toolbar-row--stack">
        <div class="landing-admin-import-row">
          <select id="landing-news-import-target" class="landing-admin-input">
            ${options.renderTargetOptionsHtml ? options.renderTargetOptionsHtml(options.landingTargetBoth || '', { includeBoth: true }) : ''}
          </select>
          <input id="landing-news-import-url" class="landing-admin-input landing-admin-input--grow" type="url" placeholder="Paste article URL to import" onpaste="handleLandingNewsImportPaste()">
          <button type="button" class="btn-small admin-console-primary-btn" onclick="importLandingNewsDraft()">Import Story</button>
        </div>
        <label class="landing-admin-toggle">
          <input type="checkbox" ${filter.showArchived ? 'checked' : ''} onchange="toggleLandingSectionArchivedFilter('news', this.checked)">
          Show archived
        </label>
      </div>
      ${visibleItems.length ? `<div class="landing-admin-editor-list">${visibleItems.map(item => renderNewsCardHtml(item, normalized.liveContent.news)).join('')}</div>` : `
        <article class="landing-admin-note">
          <strong>No ${filter.showArchived ? '' : 'active '}stories yet.</strong>
          <p>Paste an article URL to create or refresh a draft news card. Missing fields stay editable in draft until the section is ready.</p>
        </article>`}
    `;
      }
      if (issuesEl) {
        issuesEl.innerHTML = validation.valid
          ? ''
          : validation.issues.map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`).join('');
      }
      setPanelBadge('news', validation);
      return normalized;
    }

    function renderReviewsPanel(record = store.getRecord()) {
      const normalized = getRecord(record);
      const bodyEl = document.getElementById('landing-reviews-panel-body');
      const issuesEl = document.getElementById('landing-reviews-issues');
      const validation = validateReviewsSection(normalized.draftContent.reviews);
      const filter = getSectionFilter('reviews');
      if (bodyEl) {
        bodyEl.innerHTML = `
      <div class="landing-admin-toolbar-row">
        <label class="landing-admin-toggle">
          <input type="checkbox" ${filter.showArchived ? 'checked' : ''} onchange="toggleLandingSectionArchivedFilter('reviews', this.checked)">
          Show archived
        </label>
      </div>
      <div class="landing-admin-review-lanes">
        ${knownRestaurants().map(restaurant => {
          const items = getVisibleItems(sortReviews(normalized.draftContent.reviews.restaurants[restaurant.id]), filter.showArchived);
          return `
            <section class="landing-admin-review-lane">
              <div class="landing-admin-review-lane-head">
                <div>
                  <p class="settings-section-kicker">${escHtml(restaurant.name)}</p>
                  <h5>${escHtml(restaurant.name)}</h5>
                </div>
                <span class="landing-tag ${getTargetAccentClass(restaurant.id)}">${escHtml(items.length)} draft</span>
              </div>
              <div class="landing-admin-import-row">
                <input id="landing-review-import-url-${escHtml(restaurant.id)}" class="landing-admin-input landing-admin-input--grow" type="url" placeholder="Paste Google review URL" onpaste="handleLandingReviewImportPaste(${options.escAttrJs ? options.escAttrJs(restaurant.id) : JSON.stringify(String(restaurant.id))})">
                <button type="button" class="btn-small admin-console-primary-btn" onclick="importLandingReviewDraft(${options.escAttrJs ? options.escAttrJs(restaurant.id) : JSON.stringify(String(restaurant.id))})">Import Review</button>
              </div>
              ${items.length ? `<div class="landing-admin-editor-list">${items.map(item => renderReviewCardHtml(item, restaurant.id, normalized.liveContent.reviews.restaurants[restaurant.id])).join('')}</div>` : `
                <article class="landing-admin-note">
                  <strong>No ${filter.showArchived ? '' : 'active '}reviews yet.</strong>
                  <p>Imported Google reviews stay frozen as draft snapshots until you explicitly refresh and republish them.</p>
                </article>`}
            </section>`;
        }).join('')}
      </div>
    `;
      }
      if (issuesEl) {
        issuesEl.innerHTML = validation.valid
          ? ''
          : validation.issues.map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`).join('');
      }
      setPanelBadge('reviews', validation);
      return normalized;
    }

    function renderOverview(record = store.getRecord()) {
      const normalized = getRecord(record);
      const diffSectionIds = getDraftDiffSectionIds(normalized);
      const statuses = ['hours', 'events', 'news', 'reviews'].map(sectionId => getSectionStatus(sectionId, normalized));
      const blockingIssues = statuses.flatMap(status => status.issues || []);
      const allValid = statuses.every(status => status.isValid);
      const rootStatusEl = document.getElementById('landing-overview-root-status');
      const rootCopyEl = document.getElementById('landing-overview-root-copy');
      const draftSavedEl = document.getElementById('landing-overview-draft-saved');
      const draftCopyEl = document.getElementById('landing-overview-draft-copy');
      const livePublishedEl = document.getElementById('landing-overview-live-published');
      const liveCopyEl = document.getElementById('landing-overview-live-copy');
      const heroLinesEl = document.getElementById('landing-overview-hero-lines');
      const heroCopyEl = document.getElementById('landing-overview-hero-copy');
      const listEl = document.getElementById('landing-overview-section-list');
      const issuesEl = document.getElementById('landing-overview-issues');
      const healthBadgeEl = document.getElementById('landing-overview-health-badge');
      const leroysStatus = restaurants.LEROYS ? computeStatusForRestaurant(normalized.liveContent.hours, restaurants.LEROYS.id) : { label: '' };
      const elroysStatus = restaurants.ELROYS ? computeStatusForRestaurant(normalized.liveContent.hours, restaurants.ELROYS.id) : { label: '' };

      if (rootStatusEl) rootStatusEl.textContent = store.getLoadError() ? 'Fallback ready' : 'Live shell ready';
      if (rootCopyEl) {
        rootCopyEl.textContent = store.getLoadError()
          ? 'The public root can fall back to the simple chooser if landing data fails.'
          : 'The richer root shell can render from the published landing-page snapshot.';
      }
      if (draftSavedEl) draftSavedEl.textContent = formatTimestampLabel(normalized.draftSavedTs);
      if (draftCopyEl) {
        draftCopyEl.textContent = diffSectionIds.length
          ? `${diffSectionIds.length} subsection draft${diffSectionIds.length === 1 ? '' : 's'} differ from live.`
          : 'Draft and live are currently aligned.';
      }
      if (livePublishedEl) livePublishedEl.textContent = formatTimestampLabel(normalized.livePublishedTs);
      if (liveCopyEl) {
        liveCopyEl.textContent = normalized.livePublishedTs
          ? 'Publish promotes only the sections you select.'
          : 'No landing-page sections have been published live yet.';
      }
      if (heroLinesEl) heroLinesEl.textContent = `${leroysStatus.label || ''} / ${elroysStatus.label || ''}`;
      if (heroCopyEl) heroCopyEl.textContent = 'These public hero lines are generated from the live recurring-hours schedules.';
      if (healthBadgeEl) {
        healthBadgeEl.textContent = allValid ? 'Healthy' : 'Needs attention';
        healthBadgeEl.className = `landing-admin-section-badge ${allValid ? 'is-ready' : 'is-blocked'}`;
      }
      if (listEl) {
        listEl.innerHTML = sectionOrder.map(sectionId => {
          const status = getSectionStatus(sectionId, normalized);
          const badgeClass = status.isValid ? 'is-ready' : 'is-blocked';
          const badgeText = !status.isValid ? 'Blocked' : (status.hasDraftDiff ? 'Drafting' : 'Live');
          const description = status.hasDraftDiff
            ? 'Draft differs from the currently published snapshot.'
            : 'Draft and live match right now.';
          return `
        <article class="landing-overview-section-item">
          <div>
            <strong>${escHtml(status.label)}</strong>
            <span>${escHtml(description)}</span>
          </div>
          <span class="landing-admin-section-badge ${badgeClass}">${escHtml(badgeText)}</span>
        </article>`;
        }).join('');
      }
      if (issuesEl) {
        issuesEl.innerHTML = allValid
          ? ''
          : blockingIssues.map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`).join('');
      }
      return normalized;
    }

    function renderHoursValidationState(record = store.getRecord()) {
      const normalized = getRecord(record);
      const issuesEl = document.getElementById('landing-hours-issues');
      const badgeEl = document.getElementById('landing-hours-panel-badge');
      const validation = getHoursSectionValidation(normalized);

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
      const normalized = getRecord(record);
      const diffSectionIds = getDraftDiffSectionIds(normalized);
      const draftButton = document.getElementById('landing-save-draft-btn');
      const publishButton = document.getElementById('landing-publish-btn');
      const livePill = document.getElementById('landing-admin-live-pill');
      const draftPill = document.getElementById('landing-admin-draft-pill');
      const noteEl = document.getElementById('landing-admin-toolbar-note');

      if (draftButton) draftButton.disabled = !store.isDirty();
      if (publishButton) publishButton.disabled = diffSectionIds.length === 0;

      if (livePill) {
        livePill.textContent = normalized.livePublishedTs
          ? `Live ${formatTimestampLabel(normalized.livePublishedTs)}`
          : 'Live shell pending';
        livePill.className = `landing-admin-status-pill ${normalized.livePublishedTs ? 'is-live' : ''}`;
      }
      if (draftPill) {
        const draftText = store.isDirty()
          ? 'Unsaved draft changes'
          : (diffSectionIds.length ? `${diffSectionIds.length} draft sections ready` : 'No draft changes');
        draftPill.textContent = draftText;
        draftPill.className = `landing-admin-status-pill ${store.isDirty() || diffSectionIds.length ? 'is-draft' : ''}`;
      }
      if (noteEl) {
        noteEl.textContent = store.getLoadError()
          ? store.getLoadError()
          : (store.isDirty()
              ? 'Save Draft stores the shared landing snapshot without changing the public root.'
              : (diffSectionIds.length
                  ? 'Publish Live promotes only the subsections you select.'
                  : 'Landing-page draft and live snapshots are currently aligned.'));
      }
      return normalized;
    }

    function renderHoursPanel(record = store.getRecord()) {
      const normalized = getRecord(record);
      const gridEl = document.getElementById('landing-admin-hours-grid');
      if (gridEl) {
        gridEl.innerHTML = knownRestaurants().map(restaurant => (
          renderHoursRowsHtml(normalized.draftContent.hours, restaurant.id, restaurant.name)
        )).join('');
      }
      renderHoursValidationState(normalized);
      return normalized;
    }

    function renderWorkspace(options = {}) {
      if (!hasAdminShell()) return null;
      const forceReload = options && options.forceReload === true;
      const render = (record) => {
        const normalized = syncStoreRecord(record, { dirty: store.isDirty() });
        renderOverview(normalized);
        renderHoursPanel(normalized);
        renderEventsPanel(normalized);
        renderNewsPanel(normalized);
        renderReviewsPanel(normalized);
        updateToolbar(normalized);
        focusAdminPanel(store.getActivePanel());
        return normalized;
      };

      if (store.hasLoaded({ includeDraft: true }) && !forceReload) {
        return render(store.getRecord());
      }

      updateToolbar(createDefaultRecord());
      return dataService.ensureLoaded({ force: forceReload, includeDraft: true })
        .then(render)
        .catch(() => {
          const fallbackRecord = store.getRecord() || createDefaultRecord();
          syncStoreRecord(fallbackRecord, { dirty: false });
          return render(fallbackRecord);
        });
    }

    function refreshHoursAdminState(record = store.getRecord()) {
      const normalized = syncStoreRecord(record, { dirty: store.isDirty() });
      renderOverview(normalized);
      renderHoursValidationState(normalized);
      updateToolbar(normalized);
      return normalized;
    }

    function setHoursField(restaurantId, dayKey, field, value) {
      const record = updateDraftRecord(nextRecord => {
        if (!nextRecord.draftContent.hours.restaurants[restaurantId]) {
          nextRecord.draftContent.hours.restaurants[restaurantId] = options.createDefaultHoursRestaurant
            ? options.createDefaultHoursRestaurant()
            : { days: {} };
        }
        const targetDay = nextRecord.draftContent.hours.restaurants[restaurantId].days[dayKey] || (
          options.createDefaultDay ? options.createDefaultDay() : { closed: true, open: '', close: '' }
        );
        if (field === 'closed') {
          targetDay.closed = !!value;
          if (targetDay.closed) {
            targetDay.open = '';
            targetDay.close = '';
          }
        } else if (field === 'open' || field === 'close') {
          targetDay[field] = typeof model.normalizeTimeValue === 'function' ? model.normalizeTimeValue(value) : value;
          if (targetDay[field]) targetDay.closed = false;
        }
        nextRecord.draftContent.hours.restaurants[restaurantId].days[dayKey] = options.normalizeDay
          ? options.normalizeDay(targetDay)
          : targetDay;
      }, { rerender: false });
      if (field === 'closed') {
        renderWorkspace();
        return record;
      }
      refreshHoursAdminState(record);
      return record;
    }

    function updateDraftRecord(mutator = () => {}, options = {}) {
      const rerender = options && options.rerender !== false;
      const record = store.updateRecord(mutator, { dirty: true, loadScope: 'draft' });
      syncLegacyStateFromStore();
      if (rerender) renderWorkspace();
      return record;
    }

    function findItemById(items = [], itemId = '') {
      return Array.isArray(items) ? items.find(item => item && item.id === itemId) || null : null;
    }

    function markItemUpdated(item = {}) {
      item.updatedAt = String(now());
      return item;
    }

    function findNewsItemByUrl(items = [], url = '') {
      const candidate = String(url || '').trim();
      if (!candidate) return null;
      return items.find(item => (
        item && (item.href === candidate || item.importMeta?.sourceUrl === candidate)
      )) || null;
    }

    function findReviewItemByUrl(items = [], url = '') {
      const candidate = String(url || '').trim();
      if (!candidate) return null;
      return items.find(item => (
        item && (item.href === candidate || item.importMeta?.sourceUrl === candidate)
      )) || null;
    }

    function applyImportMeta(currentMeta = {}, result = {}) {
      const attemptedAt = result && result.attemptedAt ? String(result.attemptedAt) : String(now());
      const nextStatus = result && result.status ? result.status : options.landingImportStatusFailed || 'failed';
      const wasSuccessful = nextStatus === landingImportStatusImported || nextStatus === (options.landingImportStatusPartial || 'partial');
      return typeof model.normalizeImportMeta === 'function'
        ? model.normalizeImportMeta({
            ...currentMeta,
            sourceUrl: result && (result.sourceUrl || result.href) || currentMeta?.sourceUrl || '',
            lastAttemptTs: attemptedAt,
            lastSuccessTs: wasSuccessful ? attemptedAt : currentMeta?.lastSuccessTs,
            status: nextStatus,
            messages: Array.isArray(result && result.messages) ? result.messages : currentMeta?.messages,
          })
        : currentMeta;
    }

    async function requestImport(kind = 'import_news', payload = {}) {
      const currentUser = getCurrentUser();
      if (!currentUser?.accessToken || typeof postApiJson !== 'function') {
        throw new Error('Sign in as an admin to import landing-page content.');
      }
      const result = await postApiJson('/api/admin', {
        action: kind,
        ...payload,
      }, {
        headers: getAuthorizedApiHeaders(),
      });
      if (!result.ok) throw new Error(result.payload?.error || result.payload?.message || 'Import failed.');
      return result.payload || {};
    }

    function upsertNewsDraftFromImport(target = landingTargetBoth, result = {}) {
      const sourceUrl = String(result?.sourceUrl || result?.href || '').trim();
      return updateDraftRecord(record => {
        const items = record.draftContent.news.items;
        const existing = findNewsItemByUrl(items, sourceUrl);
        const base = existing || (typeof model.createDefaultNewsItem === 'function' ? model.createDefaultNewsItem() : {});
        const nextItem = typeof model.normalizeNewsItem === 'function'
          ? model.normalizeNewsItem({
              ...base,
              target: existing?.target || (typeof model.normalizeTarget === 'function' ? model.normalizeTarget(target, { allowBoth: true }) : target),
              title: result?.title || base.title,
              body: result?.body || base.body,
              href: result?.href || sourceUrl || base.href,
              source: result?.source || base.source,
              publishedDate: result?.publishedDate || base.publishedDate,
              imageUrl: result?.imageUrl || base.imageUrl,
              importMeta: applyImportMeta(base.importMeta, result),
              updatedAt: String(now()),
            })
          : base;
        if (existing) {
          const index = items.findIndex(item => item.id === existing.id);
          if (index >= 0) items[index] = nextItem;
        } else {
          items.unshift(nextItem);
        }
      });
    }

    function upsertReviewDraftFromImport(restaurantId = '', result = {}) {
      return updateDraftRecord(record => {
        if (!record.draftContent.reviews.restaurants[restaurantId]) {
          record.draftContent.reviews.restaurants[restaurantId] = [];
        }
        const items = record.draftContent.reviews.restaurants[restaurantId];
        const sourceUrl = String(result?.sourceUrl || result?.href || '').trim();
        const existing = findReviewItemByUrl(items, sourceUrl);
        const base = existing || (typeof model.createDefaultReviewItem === 'function' ? model.createDefaultReviewItem() : {});
        const nextItem = typeof model.normalizeReviewItem === 'function'
          ? model.normalizeReviewItem({
              ...base,
              href: result?.href || sourceUrl || base.href,
              author: result?.author || base.author,
              quote: result?.quote || base.quote,
              source: result?.source || base.source || 'Google Review',
              rating: result?.rating || base.rating,
              importMeta: applyImportMeta(base.importMeta, result),
              updatedAt: String(now()),
            })
          : base;
        if (existing) {
          const index = items.findIndex(item => item.id === existing.id);
          if (index >= 0) items[index] = nextItem;
        } else {
          items.unshift(nextItem);
        }
      });
    }

    function addEventDraft() {
      return updateDraftRecord(record => {
        record.draftContent.events.items.unshift({
          ...(typeof model.createDefaultEventItem === 'function' ? model.createDefaultEventItem() : {}),
          updatedAt: String(now()),
        });
      });
    }

    function updateEventField(itemId = '', field = '', value = '') {
      return updateDraftRecord(record => {
        const item = findItemById(record.draftContent.events.items, itemId);
        if (!item) return;
        if (field === 'target') item.target = typeof model.normalizeTarget === 'function' ? model.normalizeTarget(value, { allowBoth: true }) : value;
        else if (field === 'eventDate') item.eventDate = String(value || '');
        else if (field === 'startTime' || field === 'endTime') item[field] = typeof model.normalizeTimeValue === 'function' ? model.normalizeTimeValue(value) : value;
        else item[field] = typeof value === 'string' ? value : '';
        if (field === 'endTime' && item.endTime) item.timingNote = '';
        markItemUpdated(item);
      });
    }

    function toggleEventArchived(itemId = '', archived = false) {
      return updateDraftRecord(record => {
        const item = findItemById(record.draftContent.events.items, itemId);
        if (!item) return;
        item.archived = !!archived;
        item.archivedAt = archived ? String(now()) : '';
        markItemUpdated(item);
      });
    }

    function updateNewsField(itemId = '', field = '', value = '') {
      return updateDraftRecord(record => {
        const item = findItemById(record.draftContent.news.items, itemId);
        if (!item) return;
        if (field === 'target') item.target = typeof model.normalizeTarget === 'function' ? model.normalizeTarget(value, { allowBoth: true }) : value;
        else item[field] = typeof value === 'string' ? value : '';
        if (field === 'href' && !item.importMeta?.sourceUrl) {
          item.importMeta = typeof model.normalizeImportMeta === 'function'
            ? model.normalizeImportMeta({ ...item.importMeta, sourceUrl: item.href })
            : item.importMeta;
        }
        markItemUpdated(item);
      });
    }

    function toggleNewsArchived(itemId = '', archived = false) {
      return updateDraftRecord(record => {
        const item = findItemById(record.draftContent.news.items, itemId);
        if (!item) return;
        item.archived = !!archived;
        item.archivedAt = archived ? String(now()) : '';
        markItemUpdated(item);
      });
    }

    function updateReviewField(restaurantId = '', itemId = '', field = '', value = '') {
      return updateDraftRecord(record => {
        const items = record.draftContent.reviews.restaurants[restaurantId] || [];
        const item = findItemById(items, itemId);
        if (!item) return;
        if (field === 'rating') item.rating = value ? String(Number(value)) : '';
        else item[field] = typeof value === 'string' ? value : '';
        if (field === 'href' && !item.importMeta?.sourceUrl) {
          item.importMeta = typeof model.normalizeImportMeta === 'function'
            ? model.normalizeImportMeta({ ...item.importMeta, sourceUrl: item.href })
            : item.importMeta;
        }
        markItemUpdated(item);
      });
    }

    function toggleReviewArchived(restaurantId = '', itemId = '', archived = false) {
      return updateDraftRecord(record => {
        const items = record.draftContent.reviews.restaurants[restaurantId] || [];
        const item = findItemById(items, itemId);
        if (!item) return;
        item.archived = !!archived;
        item.archivedAt = archived ? String(now()) : '';
        markItemUpdated(item);
      });
    }

    function toggleSectionArchivedFilter(sectionId = '', checked = false) {
      if (typeof setSectionFilter === 'function') {
        setSectionFilter(sectionId, 'showArchived', checked);
      }
      return renderWorkspace();
    }

    function handleNewsImportPaste() {
      if (typeof scheduleTask === 'function') {
        scheduleTask(() => {
          importNewsDraft();
        }, 0);
      }
    }

    function handleReviewImportPaste(restaurantId = '') {
      if (typeof scheduleTask === 'function') {
        scheduleTask(() => {
          importReviewDraft(restaurantId);
        }, 0);
      }
    }

    async function importNewsDraft() {
      const targetSelect = document.getElementById('landing-news-import-target');
      const urlInput = document.getElementById('landing-news-import-url');
      const target = targetSelect && targetSelect.value ? targetSelect.value : landingTargetBoth;
      const url = String(urlInput && urlInput.value || '').trim();
      if (!url || typeof requestImport !== 'function' || typeof upsertNewsDraftFromImport !== 'function') return;
      try {
        const result = await requestImport('import_news', { url: url, target: target });
        upsertNewsDraftFromImport(target, result);
        if (urlInput) urlInput.value = '';
        showToast(`✅ ${result && result.status === landingImportStatusImported ? 'Imported' : 'Imported with repairs needed'} news draft.`, 'success');
      } catch (error) {
        showToast(`⚠️ ${error && error.message ? error.message : 'News import failed.'}`, 'error');
      }
    }

    async function refreshNewsItem(itemId = '') {
      const record = getRecord(store.getRecord() || createDefaultRecord());
      const item = findItemById(record.draftContent.news.items, itemId);
      const sourceUrl = String(item && item.importMeta && item.importMeta.sourceUrl || item && item.href || '').trim();
      if (!item || !sourceUrl || typeof requestImport !== 'function' || typeof upsertNewsDraftFromImport !== 'function') {
        showToast('⚠️ Add an article URL before refreshing this story.', 'error');
        return;
      }
      try {
        const result = await requestImport('import_news', { url: sourceUrl, target: item.target });
        upsertNewsDraftFromImport(item.target, result);
        showToast('✅ News draft refreshed.', 'success');
      } catch (error) {
        showToast(`⚠️ ${error && error.message ? error.message : 'News refresh failed.'}`, 'error');
      }
    }

    async function importReviewDraft(restaurantId = '') {
      const urlInput = document.getElementById(`landing-review-import-url-${restaurantId}`);
      const url = String(urlInput && urlInput.value || '').trim();
      if (!url || typeof requestImport !== 'function' || typeof upsertReviewDraftFromImport !== 'function') return;
      try {
        const result = await requestImport('import_review', { url: url, restaurantId: restaurantId });
        upsertReviewDraftFromImport(restaurantId, result);
        if (urlInput) urlInput.value = '';
        showToast(`✅ ${result && result.status === landingImportStatusImported ? 'Imported' : 'Imported with repairs needed'} review draft.`, 'success');
      } catch (error) {
        showToast(`⚠️ ${error && error.message ? error.message : 'Review import failed.'}`, 'error');
      }
    }

    async function refreshReviewItem(restaurantId = '', itemId = '') {
      const record = getRecord(store.getRecord() || createDefaultRecord());
      const item = findItemById(record.draftContent.reviews.restaurants[restaurantId] || [], itemId);
      const sourceUrl = String(item && item.importMeta && item.importMeta.sourceUrl || item && item.href || '').trim();
      if (!item || !sourceUrl || typeof requestImport !== 'function' || typeof upsertReviewDraftFromImport !== 'function') {
        showToast('⚠️ Add a review URL before refreshing this review.', 'error');
        return;
      }
      try {
        const result = await requestImport('import_review', { url: sourceUrl, restaurantId: restaurantId });
        upsertReviewDraftFromImport(restaurantId, result);
        showToast('✅ Review draft refreshed.', 'success');
      } catch (error) {
        showToast(`⚠️ ${error && error.message ? error.message : 'Review refresh failed.'}`, 'error');
      }
    }

    async function saveDraft() {
      try {
        const record = getRecord(syncHoursDraftFromDom(store.getRecord()) || await dataService.ensureLoaded({ includeDraft: true }));
        await dataService.saveDraft(record, now());
        syncLegacyStateFromStore();
        renderWorkspace();
        showToast('✅ Landing page draft saved.', 'success');
      } catch (error) {
        showToast(`⚠️ ${error && error.message ? error.message : 'Landing page draft save failed.'}`, 'error');
      }
    }

    function renderPublishModal() {
      const modalEl = document.getElementById('landing-publish-modal');
      const listEl = document.getElementById('landing-publish-list');
      const issuesEl = document.getElementById('landing-publish-issues');
      const confirmButton = document.getElementById('landing-publish-confirm-btn');
      if (!modalEl || !listEl || !issuesEl || !confirmButton) return null;
      const record = getRecord(syncHoursDraftFromDom(store.getRecord()) || store.getRecord() || createDefaultRecord());
      const statuses = sectionOrder.map(sectionId => getSectionStatus(sectionId, record));
      const publishableCount = statuses.filter(status => status.hasDraftDiff && status.isValid).length;
      listEl.innerHTML = statuses.map(status => {
        const disabled = !status.hasDraftDiff || !status.isValid;
        const badgeClass = status.isValid ? 'is-ready' : 'is-blocked';
        const badgeText = !status.isValid ? 'Blocked' : (status.hasDraftDiff ? 'Ready' : 'Live');
        const helpText = !status.hasDraftDiff
          ? 'Draft and live match right now.'
          : (status.isValid ? 'Draft is ready to promote.' : 'Fix the validation issue before publishing.');
        return `
      <label class="landing-publish-option">
        <input type="checkbox" data-landing-publish-section="${escHtml(status.sectionId)}" ${disabled ? 'disabled' : 'checked'}>
        <div>
          <strong>${escHtml(status.label)}</strong>
          <p>${escHtml(helpText)}</p>
        </div>
        <span class="landing-admin-section-badge ${badgeClass}">${escHtml(badgeText)}</span>
      </label>`;
      }).join('');
      issuesEl.innerHTML = statuses
        .filter(status => !status.isValid)
        .flatMap(status => status.issues || [])
        .map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`)
        .join('');
      confirmButton.disabled = publishableCount === 0;
      return record;
    }

    function openPublishModal() {
      if (!hasAdminShell()) return;
      renderPublishModal();
      const modalEl = document.getElementById('landing-publish-modal');
      if (!modalEl) return;
      modalEl.classList.add('is-open');
      modalEl.setAttribute('aria-hidden', 'false');
    }

    function closePublishModal() {
      const modalEl = document.getElementById('landing-publish-modal');
      if (!modalEl) return;
      modalEl.classList.remove('is-open');
      modalEl.setAttribute('aria-hidden', 'true');
    }

    async function publishSections() {
      const selectedSectionIds = Array.from(document.querySelectorAll('[data-landing-publish-section]:checked'))
        .map(input => input.getAttribute('data-landing-publish-section'))
        .filter(Boolean);
      if (!selectedSectionIds.length) {
        showToast('Select at least one landing-page subsection to publish.', 'info');
        return;
      }
      try {
        const currentRecord = getRecord(syncHoursDraftFromDom(store.getRecord()) || await dataService.ensureLoaded({ includeDraft: true }));
        const blockedSection = selectedSectionIds
          .map(sectionId => getSectionStatus(sectionId, currentRecord))
          .find(status => !status.isValid);
        if (blockedSection) {
          renderPublishModal();
          showToast(`⚠️ Fix ${String(blockedSection.label || blockedSection.sectionId).toLowerCase()} before publishing it live.`, 'error');
          return;
        }
        await dataService.publishSections(currentRecord, selectedSectionIds, now());
        syncLegacyStateFromStore();
        renderWorkspace();
        if (hasRootShell()) renderRootPage(store.getRecord());
        closePublishModal();
        showToast(`✅ Published ${selectedSectionIds.length} landing-page section${selectedSectionIds.length === 1 ? '' : 's'} live.`, 'success');
      } catch (error) {
        showToast(`⚠️ ${error && error.message ? error.message : 'Landing page publish failed.'}`, 'error');
      }
    }

    return {
      renderEventsPanel: renderEventsPanel,
      renderNewsPanel: renderNewsPanel,
      renderReviewsPanel: renderReviewsPanel,
      renderOverview: renderOverview,
      renderHoursValidationState: renderHoursValidationState,
      updateToolbar: updateToolbar,
      renderHoursPanel: renderHoursPanel,
      renderWorkspace: renderWorkspace,
      setHoursField: setHoursField,
      updateDraftRecord: updateDraftRecord,
      addEventDraft: addEventDraft,
      updateEventField: updateEventField,
      toggleEventArchived: toggleEventArchived,
      updateNewsField: updateNewsField,
      toggleNewsArchived: toggleNewsArchived,
      updateReviewField: updateReviewField,
      toggleReviewArchived: toggleReviewArchived,
      toggleSectionArchivedFilter: toggleSectionArchivedFilter,
      handleNewsImportPaste: handleNewsImportPaste,
      handleReviewImportPaste: handleReviewImportPaste,
      importNewsDraft: importNewsDraft,
      refreshNewsItem: refreshNewsItem,
      importReviewDraft: importReviewDraft,
      refreshReviewItem: refreshReviewItem,
      saveDraft: saveDraft,
      renderPublishModal: renderPublishModal,
      openPublishModal: openPublishModal,
      closePublishModal: closePublishModal,
      publishSections: publishSections,
    };
  };

  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
