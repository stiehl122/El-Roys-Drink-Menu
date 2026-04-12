(function bootstrapMenuPollSchedulerModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_SESSION_MODULES__ && typeof globalScope.__HF_SESSION_MODULES__ === 'object')
    ? globalScope.__HF_SESSION_MODULES__
    : {};

  function createMenuPollScheduler(config = {}) {
    const {
      loader,
      onResult,
      onError,
      getContextKey,
    } = config;
    let activeToken = 0;
    let inFlight = null;
    let queuedReason = '';
    let queuedToken = 0;

    async function run(reason = 'interval') {
      const token = ++activeToken;
      if (inFlight) {
        queuedReason = reason;
        queuedToken = token;
        return inFlight;
      }

      inFlight = (async () => {
        let currentReason = reason;
        let currentToken = token;
        let finalResult = { skipped: true };
        while (true) {
          const requestContext = getContextKey();
          if (!requestContext) {
            finalResult = { skipped: true, reason: 'missing-context' };
          } else {
            try {
              const result = await loader({ reason: currentReason, requestContext });
              const isLatest = currentToken === activeToken;
              const contextUnchanged = requestContext === getContextKey();
              if (isLatest && contextUnchanged) {
                finalResult = await onResult(result, { reason: currentReason, requestContext });
              } else {
                finalResult = { ignored: true, reason: 'stale-result' };
              }
            } catch (error) {
              const isLatest = currentToken === activeToken;
              const contextUnchanged = requestContext === getContextKey();
              if (isLatest && contextUnchanged) onError(error, { reason: currentReason, requestContext });
              finalResult = { error };
            }
          }

          if (!queuedReason) break;
          currentReason = queuedReason;
          currentToken = queuedToken || ++activeToken;
          queuedReason = '';
          queuedToken = 0;
        }
        return finalResult;
      })().finally(() => {
        inFlight = null;
      });

      return inFlight;
    }

    return {
      tick() {
        return run('interval');
      },
      resume() {
        return run('resume');
      },
      reset() {
        activeToken = 0;
        inFlight = null;
        queuedReason = '';
        queuedToken = 0;
      },
    };
  }

  modules.createMenuPollScheduler = function createMenuPollSchedulerBoundary(config = {}, options = {}) {
    if (options && typeof options.impl === 'function') {
      return options.impl(config);
    }
    return createMenuPollScheduler(config);
  };

  globalScope.__HF_SESSION_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
