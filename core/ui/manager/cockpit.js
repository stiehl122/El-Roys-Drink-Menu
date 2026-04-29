(function bootstrapManagerCockpitUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerCockpitServiceImpl(deps = {}) {
    const documentRef = deps.document || globalScope.document;

    return {
      renderCockpit() {
        const host = documentRef?.getElementById?.('manager-cockpit-root');
        if (!host) return false;
        host.innerHTML = '';
        return true;
      },
    };
  }

  modules.createManagerCockpitService = function createManagerCockpitServiceBoundary(deps = {}) {
    return createManagerCockpitServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
