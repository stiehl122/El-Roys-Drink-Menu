(function bootstrapManagerRevisionDockUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerRevisionDockServiceImpl() {
    return {
      getDockMode(state = {}) {
        return state?.hasWork ? 'expanded' : 'collapsed';
      },
    };
  }

  modules.createManagerRevisionDockService = function createManagerRevisionDockServiceBoundary() {
    return createManagerRevisionDockServiceImpl();
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
