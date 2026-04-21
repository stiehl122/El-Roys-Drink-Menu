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
    const createPublishFacade = typeof runtime.createPublishFacade === 'function'
      ? runtime.createPublishFacade
      : (typeof globalScope.createMenuPublishFacade === 'function'
          ? globalScope.createMenuPublishFacade.bind(globalScope)
          : null);
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

    let publishFacade = null;

    function getUnavailableResult(options = {}) {
      return {
        ok: false,
        userHandled: false,
        userMessage: 'Publish service is unavailable.',
        preview: options.preview?.sections ? options.preview : sessionPorts.buildPreview(buildSnapshot('preview')),
        snapshot: buildSnapshot('publish-unavailable'),
      };
    }

    function getPublishFacade() {
      if (publishFacade) return publishFacade;
      if (createPublishFacade) {
        publishFacade = createPublishFacade(sessionPorts, {
          ...runtime,
          buildSnapshot,
        });
        return publishFacade;
      }
      if (createPublishService) {
        const publishService = createPublishService(sessionPorts, {
          ...runtime,
          buildSnapshot,
          buildPreview: () => sessionPorts.buildPreview(buildSnapshot('preview')),
        });
        publishFacade = {
          async prepare(options = {}) {
            if (typeof publishService.prepare === 'function') {
              return publishService.prepare(options);
            }
            return getUnavailableResult(options);
          },
          async commit(options = {}) {
            if (options.intent === 'save' && typeof publishService.saveDraft === 'function') {
              return publishService.saveDraft(options);
            }
            if (typeof publishService.publishUpdate === 'function') {
              return publishService.publishUpdate(options);
            }
            return getUnavailableResult(options);
          },
        };
        return publishFacade;
      }
      publishFacade = {
        async prepare(options = {}) {
          return {
            ...getUnavailableResult(options),
          };
        },
        async commit(options = {}) {
          return {
            ...getUnavailableResult(options),
          };
        },
      };
      return publishFacade;
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
      async preparePublish(options = {}) {
        const nextRequest = syncRequest(options);
        return getPublishFacade().prepare({ ...options, request: nextRequest });
      },
      async commitPublish(options = {}) {
        const nextRequest = syncRequest(options);
        return getPublishFacade().commit({ ...options, request: nextRequest });
      },
      async saveDraft(options = {}) {
        return session.commitPublish({ ...options, intent: 'save' });
      },
      async publishUpdate(options = {}) {
        return session.commitPublish(options);
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
