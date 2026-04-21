(function bootstrapMenuPublishFacadeModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_SESSION_MODULES__ && typeof globalScope.__HF_SESSION_MODULES__ === 'object')
    ? globalScope.__HF_SESSION_MODULES__
    : {};

  function createMenuPublishFacade(sessionPorts, deps = {}) {
    const workflowFactory = typeof deps.createWorkflow === 'function'
      ? deps.createWorkflow
      : (globalScope.createMenuPublishWorkflow || null);
    if (typeof workflowFactory !== 'function') {
      throw new Error('createMenuPublishWorkflow is unavailable');
    }
    const buildSnapshot = typeof deps.buildSnapshot === 'function'
      ? deps.buildSnapshot
      : ((source, request) => sessionPorts.buildSnapshot(source, request));

    const workflow = workflowFactory({
      ports: typeof deps.createPorts === 'function'
        ? deps.createPorts(sessionPorts)
        : sessionPorts,
    });

    return {
      async prepare(options = {}) {
        return workflow.preview({
          menuId: sessionPorts.getMenuId(),
          actor: sessionPorts.getActor ? sessionPorts.getActor() : null,
          source: options.source || 'web_manager',
          snapshot: options.snapshot || buildSnapshot('preview', options.request),
          request: {
            expectedLiveRevision: options.expectedLiveRevision ?? null,
            expectedDraftRevision: options.expectedDraftRevision ?? null,
            expectedNotificationRevision: options.expectedNotificationRevision ?? null,
          },
        });
      },

      async commit(options = {}) {
        return workflow.execute({
          menuId: sessionPorts.getMenuId(),
          actor: sessionPorts.getActor ? sessionPorts.getActor() : null,
          source: options.source || 'web_manager',
          intent: options.intent || 'save-and-send',
          snapshot: options.snapshot || buildSnapshot('publish', options.request),
          request: {
            selectedChangeIds: Array.isArray(options.selectedChangeIds) ? options.selectedChangeIds : [],
            expectedLiveRevision: options.expectedLiveRevision ?? null,
            expectedDraftRevision: options.expectedDraftRevision ?? null,
            expectedNotificationRevision: options.expectedNotificationRevision ?? null,
          },
        });
      },
    };
  }

  modules.createMenuPublishFacade = createMenuPublishFacade;
  globalScope.__HF_SESSION_MODULES__ = modules;
  globalScope.createMenuPublishFacade = createMenuPublishFacade;
})(typeof globalThis !== 'undefined' ? globalThis : this);
