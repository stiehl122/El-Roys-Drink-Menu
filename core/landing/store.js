(function bootstrapLandingStoreModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};

  function cloneJsonCompatible(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value ?? fallback));
    } catch (_) {
      return JSON.parse(JSON.stringify(fallback));
    }
  }

  modules.createLandingStore = function createLandingStore(options = {}) {
    const model = (options.model && typeof options.model === 'object')
      ? options.model
      : (modules.createLandingModel ? modules.createLandingModel() : null);
    if (!model || typeof model.createDefaultRecord !== 'function' || typeof model.normalizeRecord !== 'function') {
      throw new Error('Landing store requires a landing model.');
    }

    const defaultFilters = options.defaultFilters && typeof options.defaultFilters === 'object'
      ? cloneJsonCompatible(options.defaultFilters, {})
      : {};
    let state = {
      record: model.createDefaultRecord(),
      dirty: false,
      hasLoaded: false,
      loadPromise: null,
      loadError: '',
      activePanel: options.defaultActivePanel ? String(options.defaultActivePanel) : 'landing-admin-panel-overview',
      filters: defaultFilters,
      reviewCarouselIndex: 0,
    };

    function syncRecord(record, settings = {}) {
      state.record = model.normalizeRecord(record || model.createDefaultRecord());
      if (typeof settings.dirty === 'boolean') state.dirty = settings.dirty;
      if (typeof settings.loaded === 'boolean') {
        state.hasLoaded = settings.loaded;
      } else if (record) {
        state.hasLoaded = true;
      }
      return state.record;
    }

    return {
      getRecord() {
        return state.record;
      },
      setRecord(record, settings = {}) {
        return syncRecord(record, settings);
      },
      hasLoaded() {
        return state.hasLoaded;
      },
      setLoaded(value) {
        state.hasLoaded = !!value;
        return state.hasLoaded;
      },
      isDirty() {
        return state.dirty;
      },
      setDirty(value) {
        state.dirty = !!value;
        return state.dirty;
      },
      getLoadPromise() {
        return state.loadPromise;
      },
      setLoadPromise(promise) {
        state.loadPromise = promise || null;
        return state.loadPromise;
      },
      getLoadError() {
        return state.loadError;
      },
      setLoadError(message) {
        state.loadError = message ? String(message) : '';
        return state.loadError;
      },
      getActivePanel() {
        return state.activePanel;
      },
      setActivePanel(panelId) {
        state.activePanel = panelId ? String(panelId) : state.activePanel;
        return state.activePanel;
      },
      getFilters() {
        return cloneJsonCompatible(state.filters, defaultFilters);
      },
      setFilters(nextFilters = {}) {
        const incoming = nextFilters && typeof nextFilters === 'object' ? nextFilters : {};
        state.filters = cloneJsonCompatible({
          ...state.filters,
          ...incoming,
        }, defaultFilters);
        return this.getFilters();
      },
      getReviewCarouselIndex() {
        return state.reviewCarouselIndex;
      },
      setReviewCarouselIndex(nextIndex = 0) {
        const numeric = Number(nextIndex);
        state.reviewCarouselIndex = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
        return state.reviewCarouselIndex;
      },
    };
  };

  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
