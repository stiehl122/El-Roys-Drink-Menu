(function bootstrapMenuPublishServiceModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_SESSION_MODULES__ && typeof globalScope.__HF_SESSION_MODULES__ === 'object')
    ? globalScope.__HF_SESSION_MODULES__
    : {};

  function createMenuPublishServiceImpl(sessionPorts, runtime = {}, options = {}) {
    const moduleCreatePublishFacade = typeof modules.createMenuPublishFacade === 'function'
      ? modules.createMenuPublishFacade
      : null;
    const globalCreatePublishFacade = typeof globalScope.createMenuPublishFacade === 'function'
      ? globalScope.createMenuPublishFacade.bind(globalScope)
      : null;
    const createPublishFacade = typeof runtime.createPublishFacade === 'function'
      ? runtime.createPublishFacade
      : (globalCreatePublishFacade || moduleCreatePublishFacade);
    const facade = typeof createPublishFacade === 'function'
      ? createPublishFacade(sessionPorts, runtime)
      : null;
    let fallbackService = null;
    const buildSnapshot = typeof runtime.buildSnapshot === 'function'
      ? runtime.buildSnapshot
      : (() => ({ source: 'unknown' }));
    const buildPreview = typeof runtime.buildPreview === 'function'
      ? runtime.buildPreview
      : (() => sessionPorts.buildPreview?.(buildSnapshot('preview')));

    function getFallbackService() {
      if (fallbackService !== null) return fallbackService;
      fallbackService = typeof options.fallback === 'function'
        ? options.fallback()
        : undefined;
      return fallbackService;
    }

    function getUnavailableResult(message) {
      return {
        ok: false,
        userHandled: false,
        userMessage: message,
      };
    }

    function buildSaveDraftNoop(preview, source = 'draft-noop') {
      return {
        ok: false,
        noop: true,
        preview,
        snapshot: buildSnapshot(source),
      };
    }

    function normalizePreviewResult(result) {
      if (!result) return getUnavailableResult('Preview is unavailable right now.');
      if (result.preview?.sections) return result;
      if (result.payload?.preview?.sections) {
        return {
          ...result.payload,
          ok: result.ok !== false && result.payload.ok !== false,
          status: result.status,
          preview: result.payload.preview,
        };
      }
      if (result.ok === false) {
        return {
          ...result,
          userHandled: result.userHandled === true,
          userMessage: result.userMessage || result.payload?.error || 'Preview is unavailable right now.',
        };
      }
      return result;
    }

    async function prepare(opts = {}) {
      if (facade && typeof facade.prepare === 'function') {
        return facade.prepare(opts);
      }
      if (typeof sessionPorts.requestPublishPreview === 'function') {
        return normalizePreviewResult(await sessionPorts.requestPublishPreview(opts));
      }
      const fallback = getFallbackService();
      if (fallback && typeof fallback.prepare === 'function') {
        return fallback.prepare(opts);
      }
      return getUnavailableResult('Publish service is unavailable.');
    }

    async function saveDraft(opts = {}) {
      if (typeof sessionPorts.publishMenuUpdate === 'function') {
        const snapshot = buildSnapshot('draft');
        const preview = opts.preview?.sections ? opts.preview : buildPreview();
        const hasLocalDraft = !!snapshot.dirty || !!preview?.hasLocalDraft;
        const hasChanges = !!preview?.hasChanges;

        if (!hasLocalDraft || !hasChanges) {
          return buildSaveDraftNoop(preview);
        }

        return sessionPorts.publishMenuUpdate({
          ...opts,
          preview,
          mode: 'save',
          notify: false,
        });
      }
      if (facade && typeof facade.commit === 'function') {
        return facade.commit({ ...opts, intent: 'save' });
      }
      const fallback = getFallbackService();
      if (fallback && typeof fallback.saveDraft === 'function') {
        return fallback.saveDraft(opts);
      }
      return getUnavailableResult('Publish service is unavailable.');
    }

    async function publishUpdate(opts = {}) {
      if (typeof sessionPorts.publishMenuUpdate === 'function') {
        return sessionPorts.publishMenuUpdate(opts);
      }
      if (facade && typeof facade.commit === 'function') {
        return facade.commit(opts);
      }
      const fallback = getFallbackService();
      if (fallback && typeof fallback.publishUpdate === 'function') {
        return fallback.publishUpdate(opts);
      }
      return getUnavailableResult('Publish service is unavailable.');
    }

    return {
      prepare,
      saveDraft,
      publishUpdate,
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
