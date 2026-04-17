(function bootstrapMenuSessionModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_SESSION_MODULES__ && typeof globalScope.__HF_SESSION_MODULES__ === 'object')
    ? globalScope.__HF_SESSION_MODULES__
    : {};

  function createMenuSessionLifecycleImpl(ports, runtime = {}) {
    const resolveSessionPorts = typeof runtime.getMenuSessionPorts === 'function'
      ? runtime.getMenuSessionPorts
      : (() => globalScope.getMenuSessionPorts?.());
    const sessionPorts = ports || resolveSessionPorts();
    let request = sessionPorts.buildRequest();
    const createPublishService = typeof runtime.createPublishService === 'function'
      ? runtime.createPublishService
      : (typeof globalScope.createMenuPublishService === 'function'
          ? globalScope.createMenuPublishService.bind(globalScope)
          : null);

    function syncRequest(overrides = {}) {
      request = { ...request, ...sessionPorts.buildRequest(overrides) };
      return request;
    }

    function buildSnapshot(source = 'live') {
      return sessionPorts.buildSnapshot(source, request);
    }

    let publishService = null;

    function getPublishService() {
      if (publishService) return publishService;
      if (createPublishService) {
        publishService = createPublishService(sessionPorts, {
          buildSnapshot,
          buildPreview: () => sessionPorts.buildPreview(buildSnapshot('preview')),
        });
        return publishService;
      }
      publishService = {
        async saveDraft(options = {}) {
          return {
            ok: false,
            userHandled: false,
            userMessage: 'Publish service is unavailable.',
            preview: options.preview?.sections ? options.preview : sessionPorts.buildPreview(buildSnapshot('preview')),
            snapshot: buildSnapshot('publish-unavailable'),
          };
        },
        async publishUpdate(options = {}) {
          return {
            ok: false,
            userHandled: false,
            userMessage: 'Publish service is unavailable.',
            preview: options.preview?.sections ? options.preview : sessionPorts.buildPreview(buildSnapshot('preview')),
            snapshot: buildSnapshot('publish-unavailable'),
          };
        },
      };
      return publishService;
    }

    const session = {
      syncRequest,
      snapshot(source = 'live') {
        syncRequest();
        return buildSnapshot(source);
      },
      async open(options = {}) {
        const nextRequest = syncRequest(options);
        const expectedRestaurantId = options.expectedRestaurantId || nextRequest.siteRestaurantId || '';

        if (options.resolveMenu !== false) {
          const resolution = await sessionPorts.resolveMenu({ request: nextRequest, ...options });
          if (resolution?.redirect) return resolution;
        }

        if (!sessionPorts.canLoadFromNetwork({ request: nextRequest, ...options })) {
          const fallback = sessionPorts.restoreFallback({ expectedRestaurantId, request: nextRequest, ...options });
          return {
            ok: true,
            source: fallback.source,
            usedFallback: fallback.usedFallback,
            showLoadError: false,
            snapshot: fallback.snapshot || buildSnapshot(fallback.source),
          };
        }

        try {
          const snapshot = await sessionPorts.loadState({
            request: nextRequest,
            fallbackToDefault: options.fallbackToDefault,
            includeFeatured: options.includeFeatured,
            persistCache: options.persistCache,
            source: options.source || 'network',
          });
          return {
            ok: true,
            source: snapshot.source || 'network',
            usedFallback: false,
            showLoadError: false,
            snapshot,
          };
        } catch (error) {
          const fallback = sessionPorts.restoreFallback({ expectedRestaurantId, request: nextRequest, error, ...options });
          return {
            ok: false,
            error,
            source: fallback.source,
            usedFallback: fallback.usedFallback,
            showLoadError: true,
            snapshot: fallback.snapshot || buildSnapshot(fallback.source),
          };
        }
      },
      async refresh(options = {}) {
        const nextRequest = syncRequest(options);
        if (options.reason === 'poll') {
          return sessionPorts.pollState({ request: nextRequest, ...options });
        }
        return {
          ok: true,
          snapshot: await sessionPorts.loadState({ request: nextRequest, ...options }),
        };
      },
      preview() {
        syncRequest();
        return sessionPorts.buildPreview(buildSnapshot('preview'));
      },
      async saveDraft(options = {}) {
        syncRequest(options);
        return getPublishService().saveDraft(options);
      },
      async publishUpdate(options = {}) {
        syncRequest(options);
        return getPublishService().publishUpdate(options);
      },
      async save(options = {}) {
        return session.saveDraft(options);
      },
      async sendUpdate(options = {}) {
        return session.publishUpdate(options);
      },
      getSnapshot(source = 'live') {
        return session.snapshot(source);
      },
      _syncRequest(nextRequest = {}) {
        return syncRequest(nextRequest);
      },
    };

    return session;
  }

  modules.createMenuSessionLifecycle = function createMenuSessionLifecycleBoundary(ports, options = {}) {
    if (options && typeof options.impl === 'function') {
      return options.impl(ports, options);
    }
    return createMenuSessionLifecycleImpl(ports, options);
  };

  globalScope.__HF_SESSION_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
