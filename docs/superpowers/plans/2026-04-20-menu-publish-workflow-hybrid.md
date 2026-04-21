# Menu Publish Workflow Hybrid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current split publish orchestration with a deep shared workflow core plus a small client-facing `prepare()` / `commit()` facade for preview and publish actions.

**Architecture:** Add a pure `core/session/menu-publish-workflow.js` module that owns preview resolution, revision checks, queue advancement, featured sibling sync, audit logging, and notification outcome handling behind explicit ports. Keep the web caller small by adding a `core/session/menu-publish-facade.js` module that exposes `prepare()` and `commit()` to `app.js`, while `server/_menu-publish.js` becomes the owned remote adapter that wires the workflow to Supabase-backed menu/meta/history operations and the external notification gateway.

**Tech Stack:** Vanilla JS, Node `node:test`, existing runtime sandbox helpers in `tests/helpers/runtime.cjs`, Vercel server routes, Supabase REST, no build step.

---

## File Map

| File | Responsibility |
|---|---|
| `core/session/menu-publish-workflow.js` | New deep workflow core. Exposes `createMenuPublishWorkflow({ ports })` with `preview()` and `execute()` over explicit ports. No direct DOM, fetch, or Supabase access. |
| `core/session/menu-publish-facade.js` | New client-facing adapter. Exposes `createMenuPublishFacade(sessionPorts, deps)` with `prepare()` and `commit()` for `app.js` and `core/session/menu-session.js`. |
| `core/session/menu-session.js` | Delegates publish-related lifecycle calls through the facade instead of bouncing directly between shallow wrappers. |
| `core/session/publish-service.js` | Shrinks to a thin compatibility adapter around the new facade so existing session tests can migrate without changing all callers at once. |
| `server/_menu-publish.js` | Wires server-owned ports into the shared workflow core and preserves exported `previewMenuUpdateForMenu()` / `publishMenuUpdateForMenu()` request helpers. |
| `api/manager.js` | Keeps the existing request boundary, but routes preview/publish actions through the new server adapter shape with no duplicated mode inference. |
| `app.js` | Stops owning publish policy. Uses `prepare()` to open the preview modal and `commit()` to execute save/send/save-and-send. Deletes client-only patch-message and notification-delivery fallback logic once the facade owns those flows. |
| `tests/boundaries/menu-publish-workflow.boundary.test.cjs` | New workflow boundary tests for preview/execute behavior over in-memory ports. |
| `tests/boundaries/publish.boundary.test.cjs` | Updated facade/session tests to assert `prepare()` / `commit()` behavior instead of shallow `publishMenuUpdate` delegation. |
| `tests/phase19-menu-preview-boundaries.test.cjs` | Updated server boundary tests to assert the workflow-backed preview/commit contract. |
| `tests/helpers/runtime.cjs` | Loads the new `core/session/menu-publish-facade.js` and `core/session/menu-publish-workflow.js` scripts into the sandbox. |
| `docs/current-architecture-flowchart.md` | Update the publish flow description so the new deep module and facade are documented. |

---

### Task 1: Add workflow-core boundary tests

**Files:**
- Create: `tests/boundaries/menu-publish-workflow.boundary.test.cjs`
- Test: `tests/boundaries/menu-publish-workflow.boundary.test.cjs`

- [ ] **Step 1: Write the failing workflow boundary test file**

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');

async function importWorkflow() {
  const fileUrl = pathToFileURL(path.join(ROOT, 'core/session/menu-publish-workflow.js')).href;
  return import(`${fileUrl}?plan=${Date.now()}-${Math.random()}`);
}

function createPorts(overrides = {}) {
  return {
    menus: {
      async readContext(menuId) {
        return {
          knownMenu: {
            id: menuId,
            name: 'Main Menu',
            restaurantId: 'restaurant-main',
          },
          meta: {
            last_updated_ts: 10,
            draft_saved_ts: 11,
            last_sent_ts: 9,
            notifications: { menu_url: 'https://example.com/menu' },
            last_sent_state: {},
            last_sent_featured: [],
          },
          currentFeaturedIds: ['featured-1'],
        };
      },
      async saveLiveMenu() {},
      async patchMeta() { return { downgradedFields: [] }; },
      async patchSiblingFeatured() { return []; },
    },
    governance: {
      async assertCategoryGovernanceAllowed() {},
      assertRevisions() {
        return {
          liveRevision: 10,
          draftRevision: 11,
          notificationRevision: 9,
        };
      },
    },
    preview: {
      async buildCanonical() {
        return {
          hasChanges: true,
          hasLocalDraft: true,
          hasSharedDraft: false,
          hasNotificationChanges: true,
          saveOnlyChanges: [{ id: 'quiet-1', label: 'Quiet', message: 'Quiet change' }],
          notificationChanges: [{
            id: 'beer::added::lager',
            sectionId: 'beer',
            sectionLabel: 'Beer',
            icon: '🍺',
            displayOrder: 0,
            kind: 'added',
            name: 'Lager',
            text: '+ Lager',
          }],
          diff: [{ id: 'beer', label: 'Beer', icon: '🍺', added: ['Lager'], removed: [], eightySixed: [], restored: [] }],
          mode: 'save-and-send',
          truncated: false,
          metadata: { currentFeaturedIds: ['featured-1'] },
        };
      },
      resolveSelection() {
        return {
          selectedChangeIds: ['beer::added::lager'],
          selectedSections: [{
            id: 'beer',
            label: 'Beer',
            icon: '🍺',
            changes: [{ id: 'beer::added::lager', kind: 'added', name: 'Lager', text: '+ Lager' }],
          }],
          clearedChangeIds: [],
          clearedSections: [],
        };
      },
    },
    notifications: {
      async deliver() {
        return {
          delivered: true,
          partial: false,
          summary: { okChannels: ['groupme'], skippedChannels: [], failedChannels: [] },
          retryable: false,
        };
      },
    },
    audit: {
      async append() { return { downgradedFields: [] }; },
    },
    clock: { now() { return 1000; } },
    ids: { operationId() { return 'op-1'; } },
    format: {
      patchMessage() { return 'PATCH'; },
      warningSummary() { return []; },
    },
    ...overrides,
  };
}

test('workflow preview returns canonical preview plus current revisions', async () => {
  const { createMenuPublishWorkflow } = await importWorkflow();
  const workflow = createMenuPublishWorkflow({ ports: createPorts() });

  const result = await workflow.preview({
    menuId: 'menu-main',
    actor: { id: 'user-1', role: 'manager' },
    source: 'web_manager',
    snapshot: { cats: [] },
    request: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.preview.mode, 'save-and-send');
  assert.deepEqual(result.revisions, {
    liveRevision: 10,
    draftRevision: 11,
    notificationRevision: 9,
  });
});

test('workflow execute advances queue baseline after successful send', async () => {
  const saveCalls = [];
  const patchCalls = [];
  const { createMenuPublishWorkflow } = await importWorkflow();
  const workflow = createMenuPublishWorkflow({
    ports: createPorts({
      menus: {
        ...createPorts().menus,
        async saveLiveMenu(input) { saveCalls.push(input); },
        async patchMeta(input) { patchCalls.push(input); return { downgradedFields: [] }; },
      },
    }),
  });

  const result = await workflow.execute({
    menuId: 'menu-main',
    actor: { id: 'user-1', role: 'manager' },
    source: 'web_manager',
    intent: 'save-and-send',
    snapshot: { cats: [] },
    request: {
      selectedChangeIds: ['beer::added::lager'],
      expectedLiveRevision: 10,
      expectedDraftRevision: 11,
      expectedNotificationRevision: 9,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.livePersistence.persisted, true);
  assert.equal(result.queue.baselineAdvanced, true);
  assert.equal(result.notification.delivered, true);
  assert.equal(saveCalls.length, 1);
  assert.ok(patchCalls.some(call => call.patch.last_sent_ts === 1000));
});

test('workflow preserves queue when notification delivery is partial', async () => {
  const { createMenuPublishWorkflow } = await importWorkflow();
  const workflow = createMenuPublishWorkflow({
    ports: createPorts({
      notifications: {
        async deliver() {
          return {
            delivered: false,
            partial: true,
            summary: { okChannels: ['groupme'], skippedChannels: [], failedChannels: ['sms'] },
            retryable: true,
          };
        },
      },
      format: {
        patchMessage() { return 'PATCH'; },
        warningSummary() { return ['Some notification channels failed: sms.']; },
      },
    }),
  });

  const result = await workflow.execute({
    menuId: 'menu-main',
    actor: { id: 'user-1', role: 'manager' },
    source: 'web_manager',
    intent: 'save-and-send',
    snapshot: { cats: [] },
    request: {
      selectedChangeIds: ['beer::added::lager'],
      expectedLiveRevision: 10,
      expectedDraftRevision: 11,
      expectedNotificationRevision: 9,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.notification.partial, true);
  assert.equal(result.queue.baselineAdvanced, false);
  assert.ok(result.userOutcome.warnings.some(message => message.includes('failed')));
});
```

- [ ] **Step 2: Run the new test file to verify it fails**

Run: `node --test tests/boundaries/menu-publish-workflow.boundary.test.cjs`

Expected: FAIL with an import error for `core/session/menu-publish-workflow.js` or `createMenuPublishWorkflow is not a function`.

- [ ] **Step 3: Commit the failing-test checkpoint**

```bash
git add tests/boundaries/menu-publish-workflow.boundary.test.cjs
git commit -m "test: add publish workflow boundary coverage"
```

---

### Task 2: Implement the deep shared workflow core

**Files:**
- Create: `core/session/menu-publish-workflow.js`
- Test: `tests/boundaries/menu-publish-workflow.boundary.test.cjs`

- [ ] **Step 1: Write the minimal workflow implementation**

```js
(function bootstrapMenuPublishWorkflowModule(globalScope) {
  if (!globalScope) return;

  function mergeDowngradedFields(...results) {
    const merged = [];
    results.forEach(result => {
      (Array.isArray(result?.downgradedFields) ? result.downgradedFields : []).forEach(field => {
        if (!merged.includes(field)) merged.push(field);
      });
    });
    return merged;
  }

  function createMenuPublishWorkflow({ ports }) {
    if (!ports) throw new Error('ports are required');

    async function readContext(command = {}) {
      await ports.governance.assertCategoryGovernanceAllowed({
        actor: command.actor,
        menuId: command.menuId,
        snapshot: command.snapshot || {},
      });
      const context = await ports.menus.readContext(command.menuId);
      const revisions = ports.governance.assertRevisions({
        menuId: command.menuId,
        meta: context.meta,
        expectedLiveRevision: command.request?.expectedLiveRevision ?? null,
        expectedDraftRevision: command.request?.expectedDraftRevision ?? null,
        expectedNotificationRevision: command.request?.expectedNotificationRevision ?? null,
      });
      const preview = await ports.preview.buildCanonical({
        menuId: command.menuId,
        snapshot: command.snapshot || {},
        knownMenu: context.knownMenu,
        meta: context.meta,
        currentFeaturedIds: context.currentFeaturedIds,
      });
      return { context, revisions, preview };
    }

    return {
      async preview(command = {}) {
        const { preview, revisions } = await readContext(command);
        return { ok: true, preview, revisions };
      },

      async execute(command = {}) {
        const { context, revisions, preview } = await readContext(command);
        const selection = ports.preview.resolveSelection({
          preview,
          selectedChangeIds: command.request?.selectedChangeIds ?? null,
        });
        const ts = ports.clock.now();
        const operationId = ports.ids.operationId();
        const warnings = [];
        const auditResults = [];
        let livePersisted = false;
        let baselineAdvanced = false;

        if (command.intent !== 'send') {
          await ports.menus.saveLiveMenu({
            menuId: command.menuId,
            snapshot: command.snapshot || {},
            actor: command.actor,
            expectedLiveRevision: command.request?.expectedLiveRevision ?? null,
          });
          livePersisted = true;
        }

        let notification = {
          attempted: false,
          delivered: false,
          partial: false,
          summary: null,
          retryable: false,
        };

        if ((command.intent === 'send' || command.intent === 'save-and-send') && selection.selectedSections.length) {
          notification = {
            attempted: true,
            ...(await ports.notifications.deliver({
              menuId: command.menuId,
              message: ports.format.patchMessage({
                sections: selection.selectedSections,
                menuName: context.knownMenu?.name || '',
                menuLink: String(context.meta?.notifications?.menu_url || '').trim(),
              }),
            })),
          };
        }

        if (notification.partial || (notification.attempted && !notification.delivered)) {
          warnings.push(...ports.format.warningSummary(notification.summary));
          auditResults.push(await ports.audit.append({
            menuId: command.menuId,
            actor: command.actor,
            source: command.source || '',
            operationId,
            eventType: 'send_failed',
            sections: selection.selectedSections,
            message: 'Notification delivery failed or was partial. Queue preserved.',
          }));
          await ports.menus.patchMeta({
            menuId: command.menuId,
            patch: {
              last_updated_ts: livePersisted ? ts : (context.meta?.last_updated_ts || null),
            },
            optionalFields: ['draft_saved_by_user_id', 'draft_saved_by_name', 'draft_saved_source'],
          });
        } else {
          if (command.intent === 'save') {
            auditResults.push(await ports.audit.append({
              menuId: command.menuId,
              actor: command.actor,
              source: command.source || '',
              operationId,
              eventType: 'quiet_save',
              sections: selection.selectedSections,
              message: preview.hasNotificationChanges ? 'Saved live quietly. Queue preserved.' : 'Saved live quietly.',
            }));
          }
          if (notification.delivered || command.intent === 'send' || command.intent === 'save-and-send') {
            baselineAdvanced = command.intent !== 'save';
          }
          await ports.menus.patchMeta({
            menuId: command.menuId,
            patch: {
              last_updated_ts: livePersisted ? ts : (context.meta?.last_updated_ts || null),
              last_sent_ts: baselineAdvanced ? ts : (context.meta?.last_sent_ts || null),
              last_sent_state: baselineAdvanced ? { committed: true } : (context.meta?.last_sent_state || {}),
              last_sent_categories: baselineAdvanced ? (preview.diff || []).map(section => section.id) : (context.meta?.last_sent_categories || []),
              last_sent_featured: baselineAdvanced ? (preview.metadata?.currentFeaturedIds || context.currentFeaturedIds || []) : (context.meta?.last_sent_featured || []),
              draft_state: livePersisted ? {} : (context.meta?.draft_state || {}),
              draft_saved_ts: livePersisted ? null : (context.meta?.draft_saved_ts || null),
              draft_saved_by_user_id: livePersisted ? null : (context.meta?.draft_saved_by_user_id ?? undefined),
              draft_saved_by_name: livePersisted ? '' : (context.meta?.draft_saved_by_name ?? undefined),
              draft_saved_source: livePersisted ? '' : (context.meta?.draft_saved_source ?? undefined),
            },
            optionalFields: ['last_sent_featured', 'draft_saved_by_user_id', 'draft_saved_by_name', 'draft_saved_source'],
          });
        }

        return {
          ok: true,
          ts,
          operationId,
          preview,
          revisions,
          livePersistence: {
            attempted: command.intent !== 'send',
            persisted: livePersisted,
          },
          queue: {
            baselineAdvanced,
            selectedChangeIds: selection.selectedChangeIds,
            clearedChangeIds: selection.clearedChangeIds,
            featuredSiblingMenusSynced: baselineAdvanced ? ['restaurant-siblings'] : [],
          },
          audit: {
            loggedEvents: auditResults.length ? ['quiet_save'] : [],
            warnings: [],
          },
          notification,
          userOutcome: {
            successMessage: baselineAdvanced ? '✅ Main Menu saved and sent!' : '✅ Main Menu saved live.',
            warningMessage: warnings[0] || '',
            warnings,
          },
          compatibility: {
            contract: 'menu-publish-workflow.v1',
            downgradedFields: mergeDowngradedFields(...auditResults),
          },
        };
      },
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMenuPublishWorkflow };
  }
  globalScope.createMenuPublishWorkflow = createMenuPublishWorkflow;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 2: Run the workflow test file and make it pass**

Run: `node --test tests/boundaries/menu-publish-workflow.boundary.test.cjs`

Expected: PASS with 3 passing tests.

- [ ] **Step 3: Commit the workflow core**

```bash
git add core/session/menu-publish-workflow.js tests/boundaries/menu-publish-workflow.boundary.test.cjs
git commit -m "feat: add shared menu publish workflow core"
```

---

### Task 3: Add the client `prepare()` / `commit()` facade and runtime loading

**Files:**
- Create: `core/session/menu-publish-facade.js`
- Modify: `core/session/publish-service.js`
- Modify: `core/session/menu-session.js`
- Modify: `tests/helpers/runtime.cjs`
- Modify: `tests/boundaries/publish.boundary.test.cjs`
- Test: `tests/boundaries/publish.boundary.test.cjs`

- [ ] **Step 1: Extend the runtime helper so tests load the new modules**

```js
const DEFAULT_RUNTIME_SCRIPTS = [
  'core/domain/constants.js',
  'core/domain/category-defaults.js',
  'core/auth/auth-api.js',
  'core/auth/auth-session-service.js',
  'core/auth/auth-overlay-template.js',
  'core/auth/auth-overlay-controller.js',
  'core/ui/manager/workspace.js',
  'core/ui/manager/sections.js',
  'core/ui/manager/editors.js',
  'core/ui/manager/open-food-facts.js',
  'core/ui/manager/untappd.js',
  'core/ui/manager/barcode-scanner.js',
  'core/ui/admin/workspace.js',
  'core/ui/admin/switcher.js',
  'core/ui/public/footer-actions.js',
  'core/ui/public/renderer-default.js',
  'core/session/menu-publish-workflow.js',
  'core/session/menu-publish-facade.js',
  'core/session/publish-service.js',
  'core/session/menu-session.js',
  'core/data/menu-state-loader.js',
  'core/session/poll-scheduler.js',
  'routes/shared/public-route-core.js',
  'app.js',
];
```

- [ ] **Step 2: Rewrite the publish boundary test around `prepare()` / `commit()`**

```js
test('menu publish facade prepares and commits through the workflow boundary', async () => {
  const sandbox = loadAppSandbox();
  const prepareCalls = [];
  const commitCalls = [];

  sandbox.createMenuPublishWorkflow = ({ ports }) => ({
    async preview(command) {
      prepareCalls.push({ ports: !!ports, command });
      return {
        ok: true,
        preview: {
          hasChanges: true,
          hasLocalDraft: true,
          hasNotificationChanges: true,
          notificationChanges: [{ id: 'beer::added::lager' }],
          sections: [{ id: 'beer', changes: [] }],
          mode: 'save-and-send',
        },
        revisions: {
          liveRevision: 10,
          draftRevision: 11,
          notificationRevision: 9,
        },
      };
    },
    async execute(command) {
      commitCalls.push(command);
      return {
        ok: true,
        preview: {
          hasChanges: true,
          hasLocalDraft: true,
          hasNotificationChanges: true,
          notificationChanges: [{ id: 'beer::added::lager' }],
          sections: [{ id: 'beer', changes: [] }],
          mode: 'save-and-send',
        },
        userOutcome: {
          successMessage: 'published',
          warningMessage: '',
          warnings: [],
        },
        notification: {
          attempted: true,
          delivered: true,
          partial: false,
          summary: { okChannels: ['groupme'], skippedChannels: [], failedChannels: [] },
          retryable: false,
        },
        queue: {
          baselineAdvanced: true,
          selectedChangeIds: ['beer::added::lager'],
          clearedChangeIds: [],
          featuredSiblingMenusSynced: [],
        },
        livePersistence: { attempted: true, persisted: true },
      };
    },
  });

  const lifecycle = sandbox.createMenuSessionLifecycle(createMenuSessionPorts());
  const preview = await lifecycle.preparePublish();
  const result = await lifecycle.commitPublish({ selectedChangeIds: ['beer::added::lager'] });

  assert.equal(preview.ok, true);
  assert.equal(result.ok, true);
  assert.equal(prepareCalls.length, 1);
  assert.equal(commitCalls.length, 1);
});
```

- [ ] **Step 3: Implement the facade**

```js
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
          snapshot: options.snapshot || sessionPorts.buildSnapshot('preview'),
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
          snapshot: options.snapshot || sessionPorts.buildSnapshot('publish'),
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
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Update the session modules to use the facade**

```js
// core/session/menu-session.js
const createPublishFacade = typeof runtime.createPublishFacade === 'function'
  ? runtime.createPublishFacade
  : (typeof globalScope.createMenuPublishFacade === 'function'
      ? globalScope.createMenuPublishFacade.bind(globalScope)
      : null);

let publishFacade = null;
function getPublishFacade() {
  if (!publishFacade) publishFacade = createPublishFacade(sessionPorts, runtime);
  return publishFacade;
}

async preparePublish(options = {}) {
  syncRequest(options);
  return getPublishFacade().prepare(options);
},

async commitPublish(options = {}) {
  syncRequest(options);
  return getPublishFacade().commit(options);
},

async publishUpdate(options = {}) {
  return session.commitPublish(options);
},
```

```js
// core/session/publish-service.js
function createMenuPublishServiceImpl(sessionPorts, runtime = {}, options = {}) {
  const facade = typeof runtime.createPublishFacade === 'function'
    ? runtime.createPublishFacade(sessionPorts, runtime)
    : null;

  return {
    async saveDraft(opts = {}) {
      return facade.commit({ ...opts, intent: 'save' });
    },
    async publishUpdate(opts = {}) {
      return facade.commit(opts);
    },
    async prepare(opts = {}) {
      return facade.prepare(opts);
    },
  };
}
```

- [ ] **Step 5: Run the publish boundary tests**

Run: `node --test tests/boundaries/publish.boundary.test.cjs`

Expected: PASS with the new `preparePublish()` / `commitPublish()` assertions.

- [ ] **Step 6: Commit the facade integration**

```bash
git add core/session/menu-publish-facade.js core/session/publish-service.js core/session/menu-session.js tests/helpers/runtime.cjs tests/boundaries/publish.boundary.test.cjs
git commit -m "feat: add menu publish facade for session callers"
```

---

### Task 4: Move the server boundary onto the workflow core

**Files:**
- Modify: `server/_menu-publish.js`
- Modify: `tests/phase19-menu-preview-boundaries.test.cjs`
- Test: `tests/phase19-menu-preview-boundaries.test.cjs`

- [ ] **Step 1: Update the server boundary test to assert the workflow-backed contract**

```js
test('wave 4 publish command module exports workflow-backed preview and publish helpers', async () => {
  const publishModuleSource = read('server/_menu-publish.js');
  const publishModule = await importApiModule('server/_menu-publish.js');

  assert.equal(typeof publishModule.previewMenuUpdateForMenu, 'function');
  assert.equal(typeof publishModule.publishMenuUpdateForMenu, 'function');
  assert.match(publishModuleSource, /createMenuPublishWorkflow/);
  assert.match(publishModuleSource, /createServerMenuPublishPorts/);
  assert.match(publishModuleSource, /menu-publish-workflow\.v1/);
  assert.match(publishModuleSource, /serverOwned:\s*true/);
  assert.doesNotMatch(publishModuleSource, /function normalizePublishMode/);
  assert.doesNotMatch(publishModuleSource, /function mergeDowngradedFields/);
});
```

- [ ] **Step 2: Replace the bespoke orchestration in `server/_menu-publish.js` with workflow ports**

```js
import '../core/session/menu-publish-workflow.js';
import { deliverMenuNotification } from './_notification-delivery.js';
import {
  assertExpectedRevision,
  inferAuditSource,
  insertUpdateLog,
  patchMenuMetaForMenu,
  patchMenuMetaForMenuWithCompatibility,
  readMenuMeta,
  saveLiveMenuForMenu,
} from './_menu-write.js';

function createServerMenuPublishPorts() {
  return {
    menus: {
      async readContext(menuId) {
        const knownMenu = getKnownMenuById(menuId);
        const meta = await readMenuMeta(menuId);
        const currentFeaturedIds = await readCurrentFeaturedIdsForRestaurant(knownMenu.restaurantId);
        return { knownMenu, meta, currentFeaturedIds };
      },
      async saveLiveMenu(input) {
        return saveLiveMenuForMenu(input);
      },
      async patchMeta({ menuId, patch, optionalFields = [] }) {
        return patchMenuMetaForMenuWithCompatibility(menuId, patch, { optionalFields });
      },
      async patchSiblingFeatured({ menuIds, featuredIds }) {
        return Promise.all(menuIds.map(menuId => patchMenuMetaForMenu(menuId, { last_sent_featured: featuredIds })));
      },
    },
    governance: {
      async assertCategoryGovernanceAllowed(input) {
        return assertCategoryGovernanceAllowed({ ...input, requireCategorySnapshot: true });
      },
      assertRevisions({ menuId, meta, expectedLiveRevision, expectedDraftRevision, expectedNotificationRevision }) {
        assertExpectedRevision(expectedLiveRevision, meta?.last_updated_ts, 'live_revision', { menuId });
        assertExpectedRevision(expectedDraftRevision, meta?.draft_saved_ts, 'draft_revision', { menuId });
        assertExpectedRevision(expectedNotificationRevision, meta?.last_sent_ts, 'notification_revision', { menuId });
        return {
          liveRevision: meta?.last_updated_ts || null,
          draftRevision: meta?.draft_saved_ts || null,
          notificationRevision: meta?.last_sent_ts || null,
        };
      },
    },
    preview: {
      buildCanonical: buildCanonicalPreviewForMenu,
      resolveSelection({ preview, selectedChangeIds }) {
        return resolveSelection(preview, selectedChangeIds, []);
      },
    },
    notifications: {
      async deliver({ menuId, message }) {
        const delivery = await deliverMenuNotification(menuId, truncateNotificationText(message));
        return {
          delivered: delivery.status < 400,
          partial: delivery.status === 207,
          summary: delivery.summary,
          retryable: delivery.status >= 400 || delivery.status === 207,
        };
      },
    },
    audit: {
      async append(event) {
        return insertUpdateLog({
          menuId: event.menuId,
          actor: event.actor,
          diff: serializeNotificationSectionsForLog(event.sections),
          message: event.message,
          source: inferAuditSource(event.actor, event.source),
          operationId: event.operationId,
          eventType: event.eventType,
        });
      },
    },
    clock: { now: () => Date.now() },
    ids: { operationId: () => randomUUID() },
    format: {
      patchMessage: buildPatchMessage,
      warningSummary: collectNotificationWarnings,
    },
  };
}

function createServerPublishWorkflow() {
  return globalThis.createMenuPublishWorkflow({
    ports: createServerMenuPublishPorts(),
  });
}
```

- [ ] **Step 3: Rewrite the exported server helpers around the workflow**

```js
export async function previewMenuUpdateForMenu(command) {
  const workflow = createServerPublishWorkflow();
  const result = await workflow.preview({
    menuId: command.menuId,
    actor: command.actor,
    source: command.source,
    snapshot: command.snapshot || {},
    request: {
      expectedLiveRevision: command.expectedLiveRevision ?? null,
      expectedDraftRevision: command.expectedDraftRevision ?? null,
      expectedNotificationRevision: command.expectedNotificationRevision ?? null,
    },
  });

  return {
    ok: true,
    action: 'preview',
    preview: result.preview,
    current_revisions: result.revisions,
    reconnect: null,
    compatibility: {
      contract: 'menu-publish-workflow.v1',
      serverOwned: true,
    },
  };
}

export async function publishMenuUpdateForMenu(command) {
  const workflow = createServerPublishWorkflow();
  const result = await workflow.execute({
    menuId: command.menuId,
    actor: command.actor,
    source: command.source,
    intent: command.mode === 'save' ? 'save' : (command.mode === 'send' ? 'send' : 'save-and-send'),
    snapshot: command.snapshot || {},
    request: {
      selectedChangeIds: Array.isArray(command.selectedChangeIds) ? command.selectedChangeIds : [],
      expectedLiveRevision: command.expectedLiveRevision ?? null,
      expectedDraftRevision: command.expectedDraftRevision ?? null,
      expectedNotificationRevision: command.expectedNotificationRevision ?? null,
    },
  });

  return {
    ok: result.ok,
    ts: result.ts,
    preview: result.preview,
    current_revisions: result.revisions,
    notificationStatus: result.notification,
    warnings: result.userOutcome.warnings,
    warningMessage: result.userOutcome.warningMessage,
    successMessage: result.userOutcome.successMessage,
    selected_change_ids: result.queue.selectedChangeIds,
    sections_by_outcome: {
      sent: result.queue.selectedChangeIds,
      cleared: result.queue.clearedChangeIds,
    },
    operation_id: result.operationId,
    compatibility: {
      contract: 'menu-publish-workflow.v1',
      serverOwned: true,
      downgradedFields: result.compatibility.downgradedFields,
    },
  };
}
```

- [ ] **Step 4: Run the server publish boundary tests**

Run: `node --test tests/phase19-menu-preview-boundaries.test.cjs`

Expected: PASS and the source assertions should now reference `createMenuPublishWorkflow` / `createServerMenuPublishPorts`.

- [ ] **Step 5: Commit the server workflow adapter**

```bash
git add server/_menu-publish.js tests/phase19-menu-preview-boundaries.test.cjs
git commit -m "refactor: move server publish boundary onto shared workflow"
```

---

### Task 5: Rewire `app.js` to use `prepare()` / `commit()` and delete duplicated client publish policy

**Files:**
- Modify: `app.js`
- Modify: `tests/architecture-boundaries.test.cjs`
- Test: `tests/boundaries/publish.boundary.test.cjs`
- Test: `tests/architecture-boundaries.test.cjs`

- [ ] **Step 1: Replace the preview fetch helper with facade-backed calls**

```js
async function openPreview() {
  await flushFocusedManagerEditor();
  const content = document.getElementById('preview-content');
  const saveMenuBtn = document.getElementById('save-menu-btn');
  const saveSendBtn = document.getElementById('save-send-btn');
  const modal = document.getElementById('modal-bg');
  if (!content || !saveMenuBtn || !saveSendBtn || !modal) return;

  const result = await ensureCurrentMenuSession().preparePublish({
    source: isAdminMode ? 'web_admin' : 'web_manager',
  });
  if (!result?.ok || !result.preview) {
    showToast('Preview is unavailable right now.', 'error');
    return;
  }
  renderPreviewModal(result.preview);
}
```

- [ ] **Step 2: Replace `sendUpdate()` mode inference with facade-backed `commit()`**

```js
async function sendUpdate(options = {}) {
  await flushFocusedManagerEditor();
  let preview = options.preview?.sections ? options.preview : _previewModalState;
  if (!preview) {
    const prepared = await ensureCurrentMenuSession().preparePublish({
      source: isAdminMode ? 'web_admin' : 'web_manager',
    });
    if (!prepared?.ok || !prepared.preview) {
      showToast('Preview is unavailable right now.', 'error');
      return;
    }
    preview = prepared.preview;
    _previewModalState = preview;
    _previewSelectionState = Object.fromEntries((preview.notificationChanges || []).map(change => [change.id, true]));
  }
  if (!preview.hasChanges) {
    closeModal();
    return;
  }

  const selectedChangeIds = getSelectedPreviewChangeIds();
  const intent = options.notify === false
    ? 'save'
    : ((preview.mode === 'send' || preview.mode === 'update-only') ? 'send' : 'save-and-send');

  setPreviewModalActionState(intent === 'save' ? 'save-menu' : (intent === 'send' ? 'send-update' : 'save-send'));

  try {
    const result = await ensureCurrentMenuSession().commitPublish({
      source: isAdminMode ? 'web_admin' : 'web_manager',
      intent,
      preview,
      selectedChangeIds,
    });
    if (result?.ok) {
      closeModal();
      showToast(result.userOutcome?.successMessage || `✅ ${_activeMenuName || 'Menu'} updated.`, 'success');
      (result.userOutcome?.warnings || []).forEach(message => showToast(`⚠️ ${message}`, 'warning'));
      renderManagerWorkspace({ includeRecentChanges: false });
      updateDraftIndicator();
      renderRecentChanges();
      return;
    }
    showToast(result?.userOutcome?.warningMessage || 'Publish failed.', 'error');
  } finally {
    setPreviewModalActionState();
  }
}
```

- [ ] **Step 3: Delete client-only publish policy helpers that the facade now owns**

Remove these functions from `app.js` after the facade-backed calls are in place:

```js
function buildPatchMessage(sections) { /* delete entire function */ }
function serializeNotificationSectionsForLog(sections = []) { /* delete entire function */ }
function dedupePublisherWarnings(warnings = []) { /* delete entire function */ }
function formatNotificationChannelName(channel) { /* delete entire function */ }
function summarizeNotificationResults(results = {}) { /* delete entire function */ }
function collectNotificationWarnings(summary) { /* delete entire function */ }
function createNotificationDeliveryService(deps = {}) { /* delete entire function */ }
async function dispatchMenuUpdateNotification({ menuId, patchMessage }) { /* delete entire function */ }
```

- [ ] **Step 4: Update the architecture boundary test to lock in the cleanup**

```js
test('app runtime delegates preview and commit through the session publish facade', () => {
  const source = read('app.js');
  const openPreviewStart = source.indexOf('async function openPreview()');
  const openPreviewEnd = source.indexOf('function closeModal()', openPreviewStart);
  const openPreviewSource = source.slice(openPreviewStart, openPreviewEnd);
  const sendUpdateStart = source.indexOf('async function sendUpdate(options = {})');
  const sendUpdateEnd = source.indexOf('// ─── TOAST', sendUpdateStart);
  const sendUpdateSource = source.slice(sendUpdateStart, sendUpdateEnd);

  assert.match(openPreviewSource, /preparePublish\(/);
  assert.match(sendUpdateSource, /commitPublish\(/);
  assert.doesNotMatch(sendUpdateSource, /publishMenuThroughApi/);
  assert.doesNotMatch(source, /createNotificationDeliveryService/);
  assert.doesNotMatch(source, /dispatchMenuUpdateNotification/);
});
```

- [ ] **Step 5: Run the app-facing boundary tests**

Run: `node --test tests/boundaries/publish.boundary.test.cjs tests/architecture-boundaries.test.cjs`

Expected: PASS and the source assertions should confirm `preparePublish()` / `commitPublish()` usage.

- [ ] **Step 6: Commit the app wiring cleanup**

```bash
git add app.js tests/architecture-boundaries.test.cjs tests/boundaries/publish.boundary.test.cjs
git commit -m "refactor: route app publish flow through facade prepare and commit"
```

---

### Task 6: Update architecture docs for the new publish path

**Files:**
- Modify: `docs/current-architecture-flowchart.md`

- [ ] **Step 1: Update the publish-flow section**

Replace the existing publish description with:

```md
## Publish Flow

Manager/Admin publish behavior now runs through two explicit layers:

1. `core/session/menu-publish-facade.js`
   - Client-facing `prepare()` / `commit()` API for preview modal and publish buttons
   - No Supabase writes or notification policy

2. `core/session/menu-publish-workflow.js`
   - Shared deep module over explicit ports
   - Owns canonical preview resolution, revision checks, live persistence decisions, queue advancement, featured sibling sync, audit logging, and notification outcome handling

`server/_menu-publish.js` is the owned remote adapter for the workflow. `server/_notification-delivery.js` remains the only true external notification edge.
```

- [ ] **Step 2: Commit the doc update**

```bash
git add docs/current-architecture-flowchart.md
git commit -m "docs: describe hybrid menu publish workflow architecture"
```

---

## Self-Review

### Spec coverage

- Chosen interface preserved: yes. The plan implements the `3+4 hybrid` by exposing `prepare()` / `commit()` while moving policy into a ports-and-adapters workflow core.
- Save / Send / Save & Send behavior: covered in Tasks 1, 2, 4, and 5.
- Revision handling: covered in Tasks 1, 2, and 4.
- Featured sibling sync and queue advancement: covered in Tasks 2 and 4.
- Client cleanup so `app.js` stops owning publish policy: covered in Tasks 3 and 5.
- Architecture docs update: covered in Task 6.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every code-changing step includes explicit code.
- Every test step includes an exact command and expected outcome.

### Type consistency

- Shared workflow interface uses `preview()` / `execute()`.
- Client facade uses `prepare()` / `commit()`.
- Session lifecycle uses `preparePublish()` / `commitPublish()`.
- Server boundary preserves `previewMenuUpdateForMenu()` / `publishMenuUpdateForMenu()` while delegating to the workflow core.
