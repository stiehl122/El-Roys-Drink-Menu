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
    const renderHoursRowsHtml = typeof options.renderHoursRowsHtml === 'function' ? options.renderHoursRowsHtml : (() => '');
    const knownRestaurants = typeof options.knownRestaurants === 'function' ? options.knownRestaurants : (() => []);
    const restaurants = options.restaurants && typeof options.restaurants === 'object' ? options.restaurants : {};
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
    const getHoursSectionValidation = typeof options.getHoursSectionValidation === 'function'
      ? options.getHoursSectionValidation
      : ((record) => (model && typeof model.getSectionValidation === 'function' ? model.getSectionValidation('hours', record) : { valid: true, issues: [] }));
    const sectionOrder = Array.isArray(options.sectionOrder) ? options.sectionOrder.slice() : [];
    const setPanelBadge = typeof options.setPanelBadge === 'function' ? options.setPanelBadge : (() => {});
    const setSectionFilter = typeof options.setSectionFilter === 'function' ? options.setSectionFilter : null;

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

    function renderOverview(record = store.getRecord()) {
      const normalized = getRecord(record);
      const diffSectionIds = getDraftDiffSectionIds(normalized);
      const readinessSectionIds = sectionOrder.filter(sectionId => sectionId !== 'overview');
      const statuses = readinessSectionIds.map(sectionId => getSectionStatus(sectionId, normalized));
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

    function toggleSectionArchivedFilter(sectionId = '', checked = false) {
      if (typeof setSectionFilter === 'function') {
        setSectionFilter(sectionId, 'showArchived', checked);
      }
      return renderWorkspace();
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
      renderOverview: renderOverview,
      renderHoursValidationState: renderHoursValidationState,
      updateToolbar: updateToolbar,
      renderHoursPanel: renderHoursPanel,
      renderWorkspace: renderWorkspace,
      setHoursField: setHoursField,
      updateDraftRecord: updateDraftRecord,
      toggleSectionArchivedFilter: toggleSectionArchivedFilter,
      saveDraft: saveDraft,
      renderPublishModal: renderPublishModal,
      openPublishModal: openPublishModal,
      closePublishModal: closePublishModal,
      publishSections: publishSections,
    };
  };

  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
