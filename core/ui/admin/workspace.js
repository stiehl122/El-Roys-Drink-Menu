(function bootstrapAdminWorkspaceUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createAdminWorkspaceServiceImpl(deps = {}) {
    const renderMenusPanel = typeof deps.renderMenusPanel === 'function' ? deps.renderMenusPanel : (() => {});
    const initAdminSwitcherTab = typeof deps.initAdminSwitcherTab === 'function' ? deps.initAdminSwitcherTab : (() => {});
    const loadUsers = typeof deps.loadUsers === 'function' ? deps.loadUsers : (() => {});

    return {
      renderAdminWorkspace() {
        renderMenusPanel();
        initAdminSwitcherTab('notif');
        loadUsers();
      },
    };
  }

  modules.createAdminWorkspaceService = function createAdminWorkspaceServiceBoundary(deps = {}, options = {}) {
    if (options && typeof options.fallback === 'function') {
      return options.fallback();
    }
    return createAdminWorkspaceServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
