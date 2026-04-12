(function bootstrapPublicRendererUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createPublicRendererServiceImpl(deps = {}) {
    const renderPublicView = typeof deps.renderPublicView === 'function'
      ? deps.renderPublicView
      : (async () => {});
    const renderPublicViews = typeof deps.renderPublicViews === 'function'
      ? deps.renderPublicViews
      : (async () => {});

    return {
      async renderPublicView(...args) {
        return await renderPublicView(...args);
      },
      async renderPublicViews(...args) {
        return await renderPublicViews(...args);
      },
    };
  }

  modules.createPublicRendererService = function createPublicRendererServiceBoundary(deps = {}, options = {}) {
    if (options && typeof options.fallback === 'function') {
      return options.fallback();
    }
    return createPublicRendererServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
