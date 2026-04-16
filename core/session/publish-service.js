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
    const resolveDraftChangeCount = snapshot => {
      const diff = Array.isArray(snapshot?.notifyDiff) ? snapshot.notifyDiff : [];
      const saveOnlyChanges = Array.isArray(snapshot?.saveOnlyChanges) ? snapshot.saveOnlyChanges : [];
      const diffLineCount = typeof globalScope.countDiffLines === 'function'
        ? globalScope.countDiffLines(diff)
        : diff.reduce((count, section) => (
            count + (section.added?.length || 0) +
            (section.removed?.length || 0) +
            (section.eightySixed?.length || 0) +
            (section.restored?.length || 0)
          ), 0);
      return diffLineCount + saveOnlyChanges.length;
    };
    const buildSaveDraftNoop = (preview, snapshot, source = 'draft-noop') => ({
      ok: false,
      noop: true,
      preview,
      snapshot: buildSnapshot(source),
    });

    return {
      async saveDraft(options = {}) {
        const snapshot = buildSnapshot('draft');
        const preview = options.preview?.sections ? options.preview : buildPreview();
        const hasLocalDraft = !!snapshot?.dirty || !!preview?.hasLocalDraft;
        const hasChanges = !!preview?.hasChanges || resolveDraftChangeCount(snapshot) > 0;

        if (!hasLocalDraft || !hasChanges) {
          return buildSaveDraftNoop(preview, snapshot);
        }

        const request = {
          ...options,
          preview,
          mode: 'save',
          notify: false,
        };

        if (typeof sessionPorts.publishMenuUpdate === 'function') {
          return sessionPorts.publishMenuUpdate(request);
        }
        if (fallbackService && typeof fallbackService.publishUpdate === 'function') {
          return fallbackService.publishUpdate(request);
        }

        return {
          ok: false,
          userHandled: false,
          userMessage: 'Publish service is unavailable.',
          preview,
          snapshot: buildSnapshot('save-unavailable'),
        };
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
