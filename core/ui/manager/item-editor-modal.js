(function bootstrapManagerItemEditorModalUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerItemEditorModalServiceImpl() {
    return {
      open() {
        return false;
      },
      close() {
        return false;
      },
    };
  }

  modules.createManagerItemEditorModalService = function createManagerItemEditorModalServiceBoundary() {
    return createManagerItemEditorModalServiceImpl();
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
