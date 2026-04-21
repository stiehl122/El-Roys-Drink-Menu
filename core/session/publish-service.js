(function bootstrapMenuPublishServiceModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_SESSION_MODULES__ && typeof globalScope.__HF_SESSION_MODULES__ === 'object')
    ? globalScope.__HF_SESSION_MODULES__
    : {};

  function createMenuPublishServiceImpl(sessionPorts, runtime = {}, options = {}) {
    const createPublishFacade = typeof runtime.createPublishFacade === 'function'
      ? runtime.createPublishFacade
      : (typeof globalScope.createMenuPublishFacade === 'function'
          ? globalScope.createMenuPublishFacade.bind(globalScope)
          : null);
    const facade = typeof createPublishFacade === 'function'
      ? createPublishFacade(sessionPorts, runtime)
      : null;
    let fallbackService = null;

    function getFallbackService() {
      if (fallbackService !== null) return fallbackService;
      fallbackService = typeof options.fallback === 'function'
        ? options.fallback()
        : undefined;
      return fallbackService;
    }

    return {
      async saveDraft(opts = {}) {
        if (facade && typeof facade.commit === 'function') {
          return facade.commit({ ...opts, intent: 'save' });
        }
        const fallback = getFallbackService();
        if (fallback && typeof fallback.saveDraft === 'function') {
          return fallback.saveDraft(opts);
        }
        return {
          ok: false,
          userHandled: false,
          userMessage: 'Publish service is unavailable.',
        };
      },

      async publishUpdate(opts = {}) {
        if (facade && typeof facade.commit === 'function') {
          return facade.commit(opts);
        }
        const fallback = getFallbackService();
        if (fallback && typeof fallback.publishUpdate === 'function') {
          return fallback.publishUpdate(opts);
        }
        return {
          ok: false,
          userHandled: false,
          userMessage: 'Publish service is unavailable.',
        };
      },

      async prepare(opts = {}) {
        if (facade && typeof facade.prepare === 'function') {
          return facade.prepare(opts);
        }
        const fallback = getFallbackService();
        if (fallback && typeof fallback.prepare === 'function') {
          return fallback.prepare(opts);
        }
        return {
          ok: false,
          userHandled: false,
          userMessage: 'Publish service is unavailable.',
        };
      },
    };
  }

  modules.createMenuPublishService = function createMenuPublishServiceBoundary(sessionPorts, runtime = {}, options = {}) {
    if (options && typeof options.impl === 'function') {
      return options.impl(sessionPorts, runtime, options);
    }
    return createMenuPublishServiceImpl(sessionPorts, runtime, options);
  };

  globalScope.__HF_SESSION_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
