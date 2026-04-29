(function bootstrapManagerRevisionDockUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createManagerRevisionDockServiceImpl() {
    function getDockMode(state = {}) {
      if (state?.isScrollCollapsed) return 'collapsed';
      return state?.hasWork || state?.syncMessage || state?.isSaving
        ? 'expanded'
        : 'collapsed';
    }

    function renderDockHtml(state = {}) {
      const mode = getDockMode(state);
      const summary = escapeHtml(state.summary || 'No pending changes');
      const syncMessage = String(state.syncMessage || '').trim();
      const syncClass = String(state.syncClass || '').trim();
      const saveLabel = escapeHtml(state.saveLabel || 'Save');
      const saveDisabledAttr = state.saveDisabled ? ' disabled' : '';
      const discardHiddenAttr = state.showDiscard ? '' : ' hidden';
      const discardDisabledAttr = state.showDiscard ? '' : ' disabled';
      const statusClassAttr = syncClass ? ` class="${escapeHtml(syncClass)}"` : '';

      return [
        `<div class="manager-cockpit-dock-inner is-${mode}" aria-label="Revision dock">`,
        '  <div class="manager-cockpit-dock-copy">',
        '    <p class="workspace-actions-title">Revision Dock</p>',
        `    <p class="workspace-actions-sub">${summary}</p>`,
        '  </div>',
        '  <div class="manager-cockpit-dock-sync" aria-live="polite">',
        '    <span class="manager-cockpit-dock-local-status">All changes saved locally</span>',
        `    <span id="sync-status"${statusClassAttr}>${escapeHtml(syncMessage)}</span>`,
        '  </div>',
        '  <div class="manager-cockpit-dock-actions">',
        `    <button class="save-btn" id="save-btn" onclick="openPreview()" type="button" title="Review and save menu changes"${saveDisabledAttr}>${saveLabel}</button>`,
        `    <button class="btn-small" id="discard-draft-btn" onclick="discardLocalDraft()"${discardHiddenAttr} type="button"${discardDisabledAttr}>Discard Draft</button>`,
        '  </div>',
        '</div>',
      ].join('');
    }

    return {
      getDockMode,
      renderDockHtml,
    };
  }

  modules.createManagerRevisionDockService = function createManagerRevisionDockServiceBoundary() {
    return createManagerRevisionDockServiceImpl();
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
