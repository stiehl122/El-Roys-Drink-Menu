(function bootstrapManagerWorkspaceUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerWorkspaceServiceImpl(deps = {}) {
    const documentRef = deps.document || globalScope.document;
    const windowRef = deps.window || globalScope.window || globalScope;
    const getCategoryDefs = typeof deps.getCategoryDefs === 'function' ? deps.getCategoryDefs : (() => []);
    const getMenuState = typeof deps.getMenuState === 'function' ? deps.getMenuState : (() => ({}));
    const getDraftChangeCount = typeof deps.getDraftChangeCount === 'function' ? deps.getDraftChangeCount : (() => 0);
    const isDirty = typeof deps.isDirty === 'function'
      ? deps.isDirty
      : (() => !!globalScope.syncLocalDraftDirtyState?.());
    const countDiffLines = typeof deps.countDiffLines === 'function' ? deps.countDiffLines : (() => 0);
    const createDraftLedgerService = typeof deps.createDraftLedgerService === 'function'
      ? deps.createDraftLedgerService
      : (() => ({ getActionBarState: () => ({ hasDraftChanges: false, hasDraftWork: false, hasPendingUpdate: false, saveDisabled: true, publishDisabled: true, showDiscard: false }) }));

    const renderManagerCategories = typeof deps.renderManagerCategories === 'function' ? deps.renderManagerCategories : (() => {});
    const renderFeaturedTab = typeof deps.renderFeaturedTab === 'function' ? deps.renderFeaturedTab : (() => {});
    const updateManagerToolsContext = typeof deps.updateManagerToolsContext === 'function' ? deps.updateManagerToolsContext : (() => {});
    const updateActiveMenuBar = typeof deps.updateActiveMenuBar === 'function' ? deps.updateActiveMenuBar : (() => {});
    const renderRecentChanges = typeof deps.renderRecentChanges === 'function' ? deps.renderRecentChanges : (() => {});
    const renderFooter = typeof deps.renderFooter === 'function' ? deps.renderFooter : (() => {});
    const initManagerMobileDrawerTrigger = typeof deps.initManagerMobileDrawerTrigger === 'function'
      ? deps.initManagerMobileDrawerTrigger
      : (typeof deps.initCollapsingHeader === 'function' ? deps.initCollapsingHeader : (() => {}));
    const initDrawerSwipe = typeof deps.initDrawerSwipe === 'function' ? deps.initDrawerSwipe : (() => {});

    function renderManagerOverviewStats() {
      const categoryDefs = getCategoryDefs();
      const menuState = getMenuState();
      const activeItems = categoryDefs.reduce((total, cat) => (
        total + (menuState[cat.id]?.items || []).filter(item => item.onMenu !== false).length
      ), 0);
      const eightySixed = categoryDefs.reduce((total, cat) => (
        total + (menuState[cat.id]?.items || []).filter(item => item.onMenu !== false && item.eightySixed).length
      ), 0);
      const draftCount = getDraftChangeCount();
      const hasLocalDraft = !!isDirty();
      const notifyCount = !hasLocalDraft ? countDiffLines() : 0;
      const statusValue = documentRef.getElementById('manager-overview-status-value');
      const statusMeta = documentRef.getElementById('manager-overview-status-meta');
      const activeValue = documentRef.getElementById('manager-overview-active-value');
      const activeMeta = documentRef.getElementById('manager-overview-active-meta');
      const eightysixValue = documentRef.getElementById('manager-overview-86-value');
      const eightysixMeta = documentRef.getElementById('manager-overview-86-meta');

      if (statusValue) statusValue.textContent = hasLocalDraft ? 'Drafting' : 'Live';
      if (statusMeta) {
        if (hasLocalDraft) {
          statusMeta.textContent = `${draftCount} pending change${draftCount === 1 ? '' : 's'} on this device.`;
        } else if (notifyCount > 0) {
          statusMeta.textContent = `${notifyCount} update line${notifyCount === 1 ? '' : 's'} ready for review.`;
        } else {
          statusMeta.textContent = 'Live menu is current';
        }
      }
      if (activeValue) activeValue.textContent = String(activeItems);
      if (activeMeta) activeMeta.textContent = activeItems === 1 ? 'active item' : 'active items';
      if (eightysixValue) eightysixValue.textContent = String(eightySixed);
      if (eightysixMeta) eightysixMeta.textContent = eightySixed === 1 ? "item 86'd" : "items 86'd";
    }

    function syncManagerActionBarStatus(syncEl = documentRef.getElementById('sync-status')) {
      const statusWrap = syncEl?.closest('.manager-shell-actionbar-status');
      if (!statusWrap) return;
      statusWrap.hidden = !((syncEl.textContent || '').trim());
    }

    function updateManagerActionBar() {
      const bar = documentRef.getElementById('manager-action-bar');
      if (!bar) return;
      const primaryGroup = documentRef.getElementById('manager-primary-action-group');
      const summary = documentRef.getElementById('manager-action-bar-summary');
      const syncEl = documentRef.getElementById('sync-status');
      const isCompactViewport = windowRef.innerWidth <= 480;
      const ledgerState = createDraftLedgerService().getActionBarState({ isCompactViewport });
      const saveBtn = documentRef.getElementById('save-btn');
      const sendBtn = documentRef.getElementById('send-btn');
      const discardBtn = documentRef.getElementById('discard-draft-btn');
      const saveDisabled = !!ledgerState.saveDisabled && !!ledgerState.publishDisabled;

      if (primaryGroup) primaryGroup.hidden = false;
      if (saveBtn) {
        saveBtn.disabled = saveDisabled;
        saveBtn.textContent = 'Save';
        saveBtn.hidden = false;
        saveBtn.title = 'Review and save menu changes';
        saveBtn.setAttribute('aria-label', 'Review and save menu changes');
        saveBtn.setAttribute('onclick', 'openPreview()');
      }
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.hidden = true;
        sendBtn.textContent = 'Save';
        sendBtn.setAttribute('aria-hidden', 'true');
        sendBtn.setAttribute('tabindex', '-1');
      }
      if (discardBtn) {
        discardBtn.hidden = !ledgerState.showDiscard;
        discardBtn.disabled = !ledgerState.showDiscard;
      }
      bar.hidden = false;
      bar.classList.toggle('is-idle', saveDisabled && !ledgerState.showDiscard);
      syncManagerActionBarStatus(syncEl);

      if (summary) {
        const draftCount = getDraftChangeCount();
        const reviewCount = countDiffLines();
        if (ledgerState.hasDraftChanges || ledgerState.hasDraftWork) {
          const count = draftCount || reviewCount;
          summary.textContent = count > 0
            ? `${count} pending change${count === 1 ? '' : 's'}. Save reviews and saves your changes.`
            : 'Save reviews and saves your changes.';
        } else if (ledgerState.hasPendingUpdate || reviewCount > 0) {
          summary.textContent = `${reviewCount} update line${reviewCount === 1 ? '' : 's'} ready for review. Save opens the review before notifying.`;
        } else {
          summary.textContent = 'No pending changes';
        }
      }
    }

    function renderManagerWorkspace(options = {}) {
      if (options.includeLegacyManagerCategories === true) renderManagerCategories();
      renderFeaturedTab();
      updateManagerToolsContext();
      updateActiveMenuBar();
      renderManagerOverviewStats();
      if (options.includeRecentChanges !== false) renderRecentChanges();
      updateManagerActionBar();
      renderFooter();
      initManagerMobileDrawerTrigger();
      initDrawerSwipe();
    }

    function refreshManagerViews() {
      renderManagerWorkspace({ includeRecentChanges: false });
    }

    return {
      renderManagerOverviewStats,
      syncManagerActionBarStatus,
      updateManagerActionBar,
      renderManagerWorkspace,
      refreshManagerViews,
    };
  }

  modules.createManagerWorkspaceService = function createManagerWorkspaceServiceBoundary(deps = {}) {
    return createManagerWorkspaceServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
