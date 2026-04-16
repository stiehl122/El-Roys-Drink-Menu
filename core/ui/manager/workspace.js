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
      : (() => ({ getActionBarState: () => ({ hasDraftChanges: false, hasDraftWork: false, hasPendingUpdate: false, summaryText: 'No Pending Changes', publishLabel: 'Save' }) }));

    const renderManagerCategories = typeof deps.renderManagerCategories === 'function' ? deps.renderManagerCategories : (() => {});
    const renderPricingSection = typeof deps.renderPricingSection === 'function' ? deps.renderPricingSection : (() => {});
    const renderDescriptionSection = typeof deps.renderDescriptionSection === 'function' ? deps.renderDescriptionSection : (() => {});
    const renderFeaturedTab = typeof deps.renderFeaturedTab === 'function' ? deps.renderFeaturedTab : (() => {});
    const renderCategoriesTab = typeof deps.renderCategoriesTab === 'function' ? deps.renderCategoriesTab : (() => {});
    const updateManagerToolsContext = typeof deps.updateManagerToolsContext === 'function' ? deps.updateManagerToolsContext : (() => {});
    const renderDatabaseTab = typeof deps.renderDatabaseTab === 'function' ? deps.renderDatabaseTab : (() => {});
    const renderPruneSection = typeof deps.renderPruneSection === 'function' ? deps.renderPruneSection : (() => {});
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
      const ledgerState = createDraftLedgerService().getActionBarState({ isCompactViewport: windowRef.innerWidth <= 480 });
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

      if (statusValue) statusValue.textContent = hasLocalDraft ? 'Drafting' : (notifyCount > 0 ? 'Live | Unsent' : 'Live');
      if (statusMeta) {
        if (hasLocalDraft) {
          statusMeta.textContent = `${draftCount} pending change${draftCount === 1 ? '' : 's'} on this device.`;
        } else if (notifyCount > 0) {
          statusMeta.textContent = `${notifyCount} update line${notifyCount === 1 ? '' : 's'} ready to send`;
        } else {
          statusMeta.textContent = 'No unsent changes';
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
      const publishBtn = documentRef.getElementById('send-btn');
      const discardBtn = documentRef.getElementById('discard-draft-btn');

      if (primaryGroup) primaryGroup.hidden = false;
      if (saveBtn) {
        saveBtn.disabled = !!ledgerState.saveDisabled;
        saveBtn.textContent = ledgerState.saveLabel || 'Save';
        saveBtn.hidden = !ledgerState.saveLabel;
        saveBtn.title = ledgerState.hasDraftChanges ? 'Save the live menu without notifying anyone yet' : '';
      }
      if (publishBtn) {
        publishBtn.disabled = !!ledgerState.publishDisabled;
        publishBtn.textContent = ledgerState.publishLabel;
      }
      if (discardBtn) {
        discardBtn.hidden = !ledgerState.showDiscard;
        discardBtn.disabled = !ledgerState.showDiscard;
      }
      bar.hidden = false;
      bar.classList.toggle('is-idle', ledgerState.saveDisabled && ledgerState.publishDisabled && !ledgerState.showDiscard);
      syncManagerActionBarStatus(syncEl);

      if (summary) summary.textContent = ledgerState.summaryText;
    }

    function renderManagerWorkspace(options = {}) {
      renderManagerCategories();
      renderPricingSection();
      renderDescriptionSection();
      renderFeaturedTab();
      renderCategoriesTab();
      updateManagerToolsContext();
      renderDatabaseTab();
      renderPruneSection();
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
