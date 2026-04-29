(function bootstrapManagerActivityUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerActivityServiceImpl() {
    return {
      normalizeActivity(entries = []) {
        return Array.isArray(entries) ? entries : [];
      },
    };
  }

  modules.createManagerActivityService = function createManagerActivityServiceBoundary() {
    return createManagerActivityServiceImpl();
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
