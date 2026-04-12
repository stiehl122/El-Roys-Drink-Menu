(function bootstrapAdminSwitcherUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createAdminSwitcherServiceImpl(deps = {}) {
    const loadAdminSwitcherData = typeof deps.loadAdminSwitcherData === 'function'
      ? deps.loadAdminSwitcherData
      : (async () => {});
    const initAdminSwitcherTab = typeof deps.initAdminSwitcherTab === 'function'
      ? deps.initAdminSwitcherTab
      : (async () => {});
    const onAdminSwitcherRestaurantChange = typeof deps.onAdminSwitcherRestaurantChange === 'function'
      ? deps.onAdminSwitcherRestaurantChange
      : (async () => {});
    const onAdminSwitcherMenuChange = typeof deps.onAdminSwitcherMenuChange === 'function'
      ? deps.onAdminSwitcherMenuChange
      : (async () => {});

    return {
      async loadAdminSwitcherData(...args) {
        return await loadAdminSwitcherData(...args);
      },
      async initAdminSwitcherTab(...args) {
        return await initAdminSwitcherTab(...args);
      },
      async onAdminSwitcherRestaurantChange(...args) {
        return await onAdminSwitcherRestaurantChange(...args);
      },
      async onAdminSwitcherMenuChange(...args) {
        return await onAdminSwitcherMenuChange(...args);
      },
    };
  }

  modules.createAdminSwitcherService = function createAdminSwitcherServiceBoundary(deps = {}) {
    return createAdminSwitcherServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
