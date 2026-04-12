(function bootstrapManagerEditorsUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerEditorsServiceImpl(deps = {}) {
    const renderManagerCategories = typeof deps.renderManagerCategories === 'function'
      ? deps.renderManagerCategories
      : (() => {});
    const renderManagerItems = typeof deps.renderManagerItems === 'function'
      ? deps.renderManagerItems
      : (() => {});
    const renderPricingSection = typeof deps.renderPricingSection === 'function'
      ? deps.renderPricingSection
      : (() => {});
    const renderDescriptionSection = typeof deps.renderDescriptionSection === 'function'
      ? deps.renderDescriptionSection
      : (() => {});

    return {
      renderManagerCategories(...args) {
        return renderManagerCategories(...args);
      },
      renderManagerItems(...args) {
        return renderManagerItems(...args);
      },
      renderPricingSection(...args) {
        return renderPricingSection(...args);
      },
      renderDescriptionSection(...args) {
        return renderDescriptionSection(...args);
      },
    };
  }

  modules.createManagerEditorsService = function createManagerEditorsServiceBoundary(deps = {}, options = {}) {
    if (options && typeof options.fallback === 'function') {
      return options.fallback();
    }
    return createManagerEditorsServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
