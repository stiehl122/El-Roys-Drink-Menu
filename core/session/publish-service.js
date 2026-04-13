(function bootstrapMenuPublishServiceModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_SESSION_MODULES__ && typeof globalScope.__HF_SESSION_MODULES__ === 'object')
    ? globalScope.__HF_SESSION_MODULES__
    : {};

  function createMenuPublishServiceImpl(sessionPorts, runtime = {}, options = {}) {
    const buildSnapshot = typeof runtime.buildSnapshot === 'function'
      ? runtime.buildSnapshot
      : (() => ({ source: 'unknown' }));
    const buildPreview = typeof runtime.buildPreview === 'function'
      ? runtime.buildPreview
      : (() => sessionPorts.buildPreview(buildSnapshot('preview')));
    const buildFallbackService = typeof options.fallback === 'function'
      ? options.fallback
      : null;

    // Resolve the legacy fallback once during boundary construction so we do not
    // recurse back through the boundary later when publish is invoked.
    const fallbackService = buildFallbackService ? buildFallbackService() : null;

    return {
      async saveDraft(options = {}) {
        void options;
        const snapshot = buildSnapshot('draft');
        if (!snapshot.dirty) {
          return {
            ok: false,
            noop: true,
            snapshot: buildSnapshot('draft-noop'),
          };
        }
        const ts = sessionPorts.now();
        try {
          await sessionPorts.patchMenuDraftState(globalScope.buildPersistedDraftStateSnapshot(ts), ts);
          sessionPorts.commitDraft(ts);
          return {
            ok: true,
            ts,
            snapshot: buildSnapshot('draft-saved'),
          };
        } catch (error) {
          return {
            ok: false,
            userHandled: false,
            userMessage: error?.message || 'Draft save failed.',
            snapshot: buildSnapshot('draft-save-failed'),
          };
        }
      },

      async publishUpdate(options = {}) {
        if (typeof sessionPorts.publishMenuUpdate === 'function') {
          return sessionPorts.publishMenuUpdate(options);
        }
        if (fallbackService && typeof fallbackService.publishUpdate === 'function') {
          return fallbackService.publishUpdate(options);
        }
        return {
          ok: false,
          userHandled: false,
          userMessage: 'Publish service is unavailable.',
          preview: options.preview?.sections ? options.preview : buildPreview(),
          snapshot: buildSnapshot('publish-unavailable'),
        };
      },
    };
  }

  modules.createMenuPublishService = function createMenuPublishServiceBoundary(sessionPorts, runtime = {}, options = {}) {
    if (options && typeof options.impl === 'function') {
      return options.impl(sessionPorts, runtime);
    }
    return createMenuPublishServiceImpl(sessionPorts, runtime, options);
  };

  globalScope.__HF_SESSION_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
