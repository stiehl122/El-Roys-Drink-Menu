(function bootstrapManagerNotesUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerNotesServiceImpl() {
    return {
      normalizeNote(value = '') {
        return String(value ?? '');
      },
    };
  }

  modules.createManagerNotesService = function createManagerNotesServiceBoundary() {
    return createManagerNotesServiceImpl();
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
