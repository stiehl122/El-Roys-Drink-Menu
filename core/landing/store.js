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

    const normalizeFilters = typeof model.normalizeFilters === 'function'
      ? rawFilters => model.normalizeFilters(rawFilters)
      : (rawFilters => cloneJsonCompatible(rawFilters, {}));
    const defaultFilters = normalizeFilters(
      options.defaultFilters && typeof options.defaultFilters === 'object'
        ? options.defaultFilters
        : (typeof model.getDefaultFilters === 'function' ? model.getDefaultFilters() : {})
    );
    let state = {
      record: model.createDefaultRecord(),
      dirty: false,
      loadScope: 'none',
      loadPromise: null,
      loadPromiseScope: 'none',
      loadError: '',
      activePanel: options.defaultActivePanel ? String(options.defaultActivePanel) : 'landing-admin-panel-overview',
      filters: defaultFilters,
      reviewCarouselIndex: 0,
    };

    function resolveLoadScope(settings = {}) {
      if (settings && typeof settings.loadScope === 'string') return settings.loadScope;
      if (settings && settings.loaded === false) return 'none';
      return null;
    }

    function canServeScope(actualScope = 'none', requestedScope = 'live') {
      if (requestedScope === 'draft') return actualScope === 'draft';
      return actualScope === 'live' || actualScope === 'draft';
    }

    function syncRecord(record, settings = {}) {
      state.record = model.normalizeRecord(record || model.createDefaultRecord());
      if (typeof settings.dirty === 'boolean') state.dirty = settings.dirty;
      const loadScope = resolveLoadScope(settings);
      if (loadScope) {
        state.loadScope = loadScope;
      } else if (record && state.loadScope === 'none') {
        state.loadScope = 'live';
      }
      return cloneJsonCompatible(state.record, model.createDefaultRecord());
    }

    return {
      getRecord() {
        return cloneJsonCompatible(state.record, model.createDefaultRecord());
      },
      setRecord(record, settings = {}) {
        return syncRecord(record, settings);
      },
      updateRecord(mutator = () => {}, settings = {}) {
        const nextRecord = cloneJsonCompatible(state.record, model.createDefaultRecord());
        if (typeof mutator === 'function') mutator(nextRecord);
        return syncRecord(nextRecord, settings);
      },
      hasLoaded(options = {}) {
        const requestedScope = options.includeDraft === true ? 'draft' : 'live';
        return canServeScope(state.loadScope, requestedScope);
      },
      setLoaded(value, settings = {}) {
        state.loadScope = value ? (resolveLoadScope(settings) || 'live') : 'none';
        return this.hasLoaded(settings);
      },
      getLoadScope() {
        return state.loadScope;
      },
      isDirty() {
        return state.dirty;
      },
      setDirty(value) {
        state.dirty = !!value;
        return state.dirty;
      },
      getLoadPromise(options = {}) {
        const requestedScope = options.includeDraft === true ? 'draft' : 'live';
        return state.loadPromise && canServeScope(state.loadPromiseScope, requestedScope)
          ? state.loadPromise
          : null;
      },
      setLoadPromise(promise, options = {}) {
        state.loadPromise = promise || null;
        state.loadPromiseScope = promise
          ? (options.includeDraft === true ? 'draft' : 'live')
          : 'none';
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
        state.filters = normalizeFilters({
          ...state.filters,
          ...incoming,
        });
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
