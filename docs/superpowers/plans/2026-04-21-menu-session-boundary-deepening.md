# Menu Session Boundary Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `core/session/*` own the web publish flow so `app.js` stops carrying a legacy shadow implementation for preview/commit behavior.

**Architecture:** Keep the existing request-bound `createMenuSessionLifecycle()` caller contract, but move the client preview/commit adaptation behind the session boundary. `app.js` should provide browser ports and session defaults only, while `core/session/menu-session.js` and `core/session/publish-service.js` own publish orchestration. Tests should shift from delegation spies toward behavior through the session boundary.

**Tech Stack:** Plain browser JavaScript, Node test runner (`node --test`), no bundler, no dependencies.

---

## File Structure

- `app.js`
  Browser/runtime port construction only. Remove the legacy publish-shadow helpers once the session boundary owns them.
- `core/session/menu-session.js`
  Primary deep module boundary for request/snapshot lifecycle and publish coordination.
- `core/session/publish-service.js`
  Thin publish service that delegates to the session-owned facade/workflow instead of `app.js`.
- `core/session/menu-publish-facade.js`
  Adapter from session ports to workflow commands; keep caller-facing behavior stable.
- `tests/boundaries/publish.boundary.test.cjs`
  Boundary-level publish behavior through the real session lifecycle.
- `tests/phase2-session-boundaries.test.cjs`
  Guardrail tests that the app delegates to shared session modules without carrying shadow logic.

### Task 1: Lock The Desired Boundary In Tests

**Files:**
- Modify: `tests/boundaries/publish.boundary.test.cjs`
- Modify: `tests/phase2-session-boundaries.test.cjs`
- Test: `tests/boundaries/publish.boundary.test.cjs`
- Test: `tests/phase2-session-boundaries.test.cjs`

- [ ] **Step 1: Add failing boundary coverage for session-owned publish preview/commit**

```js
test('menu session lifecycle prepares and commits through shared session modules without app-owned publish helpers', async () => {
  const sandbox = loadAppSandbox();
  const previewCalls = [];
  const commitCalls = [];

  sandbox.__HF_SESSION_MODULES__.createMenuPublishService = (sessionPorts, runtime = {}) => ({
    async prepare(options = {}) {
      previewCalls.push({ sessionPorts: !!sessionPorts, options, runtime: !!runtime });
      return {
        ok: true,
        preview: { hasChanges: true, sections: [], notificationChanges: [], mode: 'save-and-send' },
        revisions: { liveRevision: 10, draftRevision: 11, notificationRevision: 9 },
      };
    },
    async publishUpdate(options = {}) {
      commitCalls.push({ sessionPorts: !!sessionPorts, options, runtime: !!runtime });
      return {
        ok: true,
        userOutcome: { successMessage: 'published', warningMessage: '', warnings: [] },
      };
    },
    async saveDraft(options = {}) {
      commitCalls.push({ sessionPorts: !!sessionPorts, options: { ...options, intent: 'save' }, runtime: !!runtime });
      return {
        ok: true,
        userOutcome: { successMessage: 'saved', warningMessage: '', warnings: [] },
      };
    },
  });

  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts());
  const preview = await lifecycle.preparePublish({ expectedLiveRevision: 10 });
  const commit = await lifecycle.publishUpdate({ selectedChangeIds: ['beer::added::lager'] });
  const save = await lifecycle.saveDraft({});

  assert.equal(preview.ok, true);
  assert.equal(commit.ok, true);
  assert.equal(save.ok, true);
  assert.equal(previewCalls.length, 1);
  assert.equal(commitCalls.length, 2);
});
```

- [ ] **Step 2: Run the targeted tests to verify the new assertions fail first**

Run: `node --test tests/boundaries/publish.boundary.test.cjs tests/phase2-session-boundaries.test.cjs`
Expected: FAIL because the lifecycle still depends on `app.js` publish-shadow helpers instead of driving the shared session module boundary directly.

- [ ] **Step 3: Tighten the session-boundary guardrail test so it rejects the app shadow path**

```js
test('app createMenuSessionLifecycle delegates publish creation through shared session modules', async () => {
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_SESSION_MODULES__: {
      createMenuSessionLifecycle: (ports, runtime = {}) => {
        return runtime.createPublishService(ports, {});
      },
      createMenuPublishService: () => ({
        delegated: true,
        prepare: async () => ({ ok: true }),
        publishUpdate: async () => ({ ok: true }),
        saveDraft: async () => ({ ok: true }),
      }),
    },
  });

  const lifecycle = sandbox.createMenuSessionLifecycle({
    buildRequest: () => ({ requestedMenuSlug: 'menu-main' }),
    buildSnapshot: source => ({ source }),
    buildPreview: snapshot => ({ ...snapshot, hasChanges: true, sections: [], notificationChanges: [] }),
    resolveMenu: async () => null,
    canLoadFromNetwork: () => true,
    restoreFallback: () => ({ source: 'cache', usedFallback: true, snapshot: { source: 'cache' } }),
    loadState: async () => ({ source: 'network' }),
    pollState: async () => ({ changed: false, designChanged: false, snapshot: { source: 'poll' } }),
  });

  assert.equal(lifecycle.delegated, true);
});
```

- [ ] **Step 4: Re-run the targeted tests and confirm they pass**

Run: `node --test tests/boundaries/publish.boundary.test.cjs tests/phase2-session-boundaries.test.cjs`
Expected: PASS, with the new assertions proving the desired boundary behavior before `app.js` cleanup starts.

- [ ] **Step 5: Commit the test-only red/green slice**

```bash
git add tests/boundaries/publish.boundary.test.cjs tests/phase2-session-boundaries.test.cjs
git commit -m "test: lock menu session publish boundary"
```

### Task 2: Move Client Publish Adaptation Behind The Session Boundary

**Files:**
- Modify: `core/session/menu-session.js`
- Modify: `core/session/publish-service.js`
- Modify: `core/session/menu-publish-facade.js`
- Test: `tests/boundaries/publish.boundary.test.cjs`

- [ ] **Step 1: Update `core/session/menu-session.js` so it owns publish-facade creation for the request-bound lifecycle**

```js
function createMenuSessionLifecycleImpl(ports, runtime = {}) {
  const resolveSessionPorts = typeof runtime.getMenuSessionPorts === 'function'
    ? runtime.getMenuSessionPorts
    : (() => globalScope.getMenuSessionPorts?.());
  const sessionPorts = ports || resolveSessionPorts();
  let request = sessionPorts.buildRequest();

  function syncRequest(overrides = {}) {
    request = { ...request, ...sessionPorts.buildRequest(overrides) };
    return request;
  }

  function buildSnapshot(source = 'live') {
    return sessionPorts.buildSnapshot(source, request);
  }

  const createPublishService = typeof runtime.createPublishService === 'function'
    ? runtime.createPublishService
    : (typeof globalScope.createMenuPublishService === 'function'
        ? globalScope.createMenuPublishService.bind(globalScope)
        : null);

  const publishService = createPublishService
    ? createPublishService(sessionPorts, {
        ...runtime,
        buildSnapshot,
        buildPreview: () => sessionPorts.buildPreview(buildSnapshot('preview')),
      })
    : null;

  return {
    syncRequest,
    snapshot(source = 'live') {
      syncRequest();
      return buildSnapshot(source);
    },
    async preparePublish(options = {}) {
      syncRequest(options);
      return publishService.prepare(options);
    },
    async commitPublish(options = {}) {
      syncRequest(options);
      return publishService.publishUpdate(options);
    },
    async saveDraft(options = {}) {
      syncRequest(options);
      return publishService.saveDraft(options);
    },
    async publishUpdate(options = {}) {
      syncRequest(options);
      return publishService.publishUpdate(options);
    },
  };
}
```

- [ ] **Step 2: Teach `core/session/publish-service.js` to normalize preview/commit behavior without `app.js` wrappers**

```js
function createMenuPublishServiceImpl(sessionPorts, runtime = {}, options = {}) {
  const createPublishFacade = typeof runtime.createPublishFacade === 'function'
    ? runtime.createPublishFacade
    : (typeof globalScope.createMenuPublishFacade === 'function'
        ? globalScope.createMenuPublishFacade.bind(globalScope)
        : null);
  const facade = typeof createPublishFacade === 'function'
    ? createPublishFacade(sessionPorts, runtime)
    : null;

  return {
    async prepare(opts = {}) {
      if (facade && typeof facade.prepare === 'function') return facade.prepare(opts);
      const fallback = typeof options.fallback === 'function' ? options.fallback() : null;
      return fallback?.prepare ? fallback.prepare(opts) : { ok: false, userHandled: false, userMessage: 'Preview is unavailable right now.' };
    },
    async saveDraft(opts = {}) {
      if (facade && typeof facade.commit === 'function') return facade.commit({ ...opts, intent: 'save' });
      const fallback = typeof options.fallback === 'function' ? options.fallback() : null;
      return fallback?.saveDraft ? fallback.saveDraft(opts) : { ok: false, userHandled: false, userMessage: 'Publish service is unavailable.' };
    },
    async publishUpdate(opts = {}) {
      if (facade && typeof facade.commit === 'function') return facade.commit(opts);
      const fallback = typeof options.fallback === 'function' ? options.fallback() : null;
      return fallback?.publishUpdate ? fallback.publishUpdate(opts) : { ok: false, userHandled: false, userMessage: 'Publish service is unavailable.' };
    },
  };
}
```

- [ ] **Step 3: Keep `core/session/menu-publish-facade.js` as the only translator from session options to workflow commands**

```js
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
}

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
}
```

- [ ] **Step 4: Run the focused publish tests**

Run: `node --test tests/boundaries/publish.boundary.test.cjs`
Expected: PASS, proving the shared session modules can prepare/commit without the app-owned client wrappers.

- [ ] **Step 5: Commit the shared-session implementation slice**

```bash
git add core/session/menu-session.js core/session/publish-service.js core/session/menu-publish-facade.js tests/boundaries/publish.boundary.test.cjs
git commit -m "refactor: deepen session-owned publish flow"
```

### Task 3: Delete The `app.js` Publish Shadow And Keep Only Browser Ports

**Files:**
- Modify: `app.js`
- Modify: `tests/phase2-session-boundaries.test.cjs`
- Test: `tests/boundaries/publish.boundary.test.cjs`
- Test: `tests/phase2-session-boundaries.test.cjs`

- [ ] **Step 1: Remove `createClientMenuPublishWorkflow()` and `createClientMenuPublishFacade()` from `app.js`**

```js
function createMenuPublishService(sessionPorts, runtime = {}) {
  if (!_sessionModuleDelegationStack.has('createMenuPublishService')) {
    const boundary = getSessionModuleBoundary();
    if (typeof boundary?.createMenuPublishService === 'function') {
      _sessionModuleDelegationStack.add('createMenuPublishService');
      try {
        return boundary.createMenuPublishService(sessionPorts, runtime, {
          fallback: () => createLegacyMenuPublishService(sessionPorts, runtime),
        });
      } finally {
        _sessionModuleDelegationStack.delete('createMenuPublishService');
      }
    }
  }

  return createLegacyMenuPublishService(sessionPorts, runtime);
}
```

Delete the app-owned helpers below this function:

```js
function createClientMenuPublishWorkflow() { /* delete */ }
function createClientMenuPublishFacade() { /* delete */ }
```

- [ ] **Step 2: Simplify `createMenuSessionLifecycle()` in `app.js` so it only injects browser/runtime ports**

```js
function createMenuSessionLifecycle(ports) {
  const sessionPorts = ports || getMenuSessionPorts();

  if (!_sessionModuleDelegationStack.has('createMenuSessionLifecycle')) {
    const boundary = getSessionModuleBoundary();
    if (typeof boundary?.createMenuSessionLifecycle === 'function') {
      _sessionModuleDelegationStack.add('createMenuSessionLifecycle');
      try {
        return boundary.createMenuSessionLifecycle(sessionPorts, {
          getMenuSessionPorts: () => getMenuSessionPorts(),
          createPublishService: (nextSessionPorts, runtime = {}) => createMenuPublishService(nextSessionPorts, runtime),
        });
      } finally {
        _sessionModuleDelegationStack.delete('createMenuSessionLifecycle');
      }
    }
  }

  return getSessionModuleBoundary().createMenuSessionLifecycle(sessionPorts, {
    getMenuSessionPorts: () => getMenuSessionPorts(),
    createPublishService: (nextSessionPorts, runtime = {}) => createMenuPublishService(nextSessionPorts, runtime),
  });
}
```

- [ ] **Step 3: Re-run the session and syntax checks**

Run: `node --test tests/boundaries/publish.boundary.test.cjs tests/phase2-session-boundaries.test.cjs`
Expected: PASS

Run: `node --check app.js`
Expected: no output

- [ ] **Step 4: Commit the app cleanup**

```bash
git add app.js tests/phase2-session-boundaries.test.cjs
git commit -m "refactor: remove app publish shadow logic"
```

## Self-Review

### Spec coverage

- Problem addressed: duplicated session/publish logic between `app.js` and `core/session/*`.
- Deep module direction: preserve request-bound session contract while moving orchestration behind the boundary.
- Tests: boundary behavior replaces delegation-heavy coverage first, then app cleanup keeps only the browser port layer.

### Placeholder scan

- No `TODO` / `TBD` placeholders remain.
- Each task names exact files and commands.
- Each code-edit step includes the target shape to implement.

### Type consistency

- Keep the existing caller-facing method names stable: `preparePublish`, `commitPublish`, `saveDraft`, `publishUpdate`.
- `prepare()` and `commit()` stay the internal publish-facade verbs.
- Request revision fields remain `expectedLiveRevision`, `expectedDraftRevision`, and `expectedNotificationRevision`.
