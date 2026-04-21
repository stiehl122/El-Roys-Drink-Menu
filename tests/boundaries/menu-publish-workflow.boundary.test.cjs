const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_ACTOR = { id: 'user-1', role: 'manager' };
const DEFAULT_SOURCE = 'web_manager';
const DEFAULT_SNAPSHOT = { cats: [] };
const DEFAULT_REVISIONS = {
  liveRevision: 10,
  draftRevision: 11,
  notificationRevision: 9,
};
const DEFAULT_SELECTED_CHANGE_IDS = ['beer::added::lager'];
const DEFAULT_NOTIFICATION_CHANGE = {
  id: 'beer::added::lager',
  sectionId: 'beer',
  sectionLabel: 'Beer',
  icon: '🍺',
  displayOrder: 0,
  kind: 'added',
  name: 'Lager',
  text: '+ Lager',
};
const DEFAULT_SELECTED_SECTION = {
  id: 'beer',
  label: 'Beer',
  icon: '🍺',
  changes: [{
    id: 'beer::added::lager',
    kind: 'added',
    name: 'Lager',
    text: '+ Lager',
  }],
};
const DEFAULT_EXECUTE_REQUEST = {
  selectedChangeIds: DEFAULT_SELECTED_CHANGE_IDS,
  expectedLiveRevision: DEFAULT_REVISIONS.liveRevision,
  expectedDraftRevision: DEFAULT_REVISIONS.draftRevision,
  expectedNotificationRevision: DEFAULT_REVISIONS.notificationRevision,
};
const DEFAULT_LAST_SENT_STATE = {
  beer: [{
    id: 'item-1',
    name: 'Lager',
    eightySixed: false,
    onMenu: true,
    visibility: 'public',
  }],
};

async function importWorkflow() {
  const fileUrl = pathToFileURL(path.join(ROOT, 'core/session/menu-publish-workflow.js')).href;
  return import(`${fileUrl}?plan=${Date.now()}-${Math.random()}`);
}

function createWorkflowInput(overrides = {}) {
  return {
    menuId: 'menu-main',
    actor: DEFAULT_ACTOR,
    source: DEFAULT_SOURCE,
    snapshot: DEFAULT_SNAPSHOT,
    ...overrides,
  };
}

function createExecuteInput(overrides = {}) {
  return createWorkflowInput({
    intent: 'save-and-send',
    request: DEFAULT_EXECUTE_REQUEST,
    ...overrides,
  });
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
          siblingMenuIds: ['menu-sibling'],
        };
      },
      async saveLiveMenu() {},
      async patchMeta() { return { downgradedFields: [] }; },
      async patchSiblingFeatured() { return []; },
    },
    governance: {
      async assertCategoryGovernanceAllowed() {},
      assertRevisions() {
        return DEFAULT_REVISIONS;
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
          notificationChanges: [DEFAULT_NOTIFICATION_CHANGE],
          diff: [{ id: 'beer', label: 'Beer', icon: '🍺', added: ['Lager'], removed: [], eightySixed: [], restored: [] }],
          mode: 'save-and-send',
          truncated: false,
          metadata: {
            currentFeaturedIds: ['featured-1'],
            lastSentState: DEFAULT_LAST_SENT_STATE,
          },
        };
      },
      resolveSelection() {
        return {
          selectedChangeIds: DEFAULT_SELECTED_CHANGE_IDS,
          selectedSections: [DEFAULT_SELECTED_SECTION],
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

  const result = await workflow.preview(createWorkflowInput({
    request: {},
  }));

  assert.equal(result.ok, true);
  assert.equal(result.preview.mode, 'save-and-send');
  assert.deepEqual(result.revisions, DEFAULT_REVISIONS);
});

test('workflow execute advances queue baseline after successful send', async () => {
  const saveCalls = [];
  const patchCalls = [];
  const siblingCalls = [];
  const auditCalls = [];
  const { createMenuPublishWorkflow } = await importWorkflow();
  const workflow = createMenuPublishWorkflow({
    ports: createPorts({
      menus: {
        ...createPorts().menus,
        async saveLiveMenu(input) { saveCalls.push(input); },
        async patchMeta(input) { patchCalls.push(input); return { downgradedFields: [] }; },
        async patchSiblingFeatured(input) { siblingCalls.push(input); return []; },
      },
      audit: {
        async append(input) {
          auditCalls.push(input);
          return { downgradedFields: [] };
        },
      },
    }),
  });

  const result = await workflow.execute(createExecuteInput());

  assert.equal(result.ok, true);
  assert.equal(result.livePersistence.persisted, true);
  assert.equal(result.queue.baselineAdvanced, true);
  assert.equal(result.notification.delivered, true);
  assert.equal(saveCalls.length, 1);
  assert.ok(patchCalls.some(call => call.patch.last_sent_ts === 1000));
  assert.deepEqual(patchCalls[0].patch.last_sent_state, DEFAULT_LAST_SENT_STATE);
  assert.deepEqual(siblingCalls, [{
    menuIds: ['menu-sibling'],
    featuredIds: ['featured-1'],
  }]);
  assert.deepEqual(result.queue.featuredSiblingMenusSynced, ['menu-sibling']);
  assert.ok(auditCalls.some(call => call.eventType === 'send_notification'));
  assert.ok(result.audit.loggedEvents.includes('send_notification'));
});

test('workflow preserves queue when notification delivery is partial', async () => {
  const patchCalls = [];
  const { createMenuPublishWorkflow } = await importWorkflow();
  const workflow = createMenuPublishWorkflow({
    ports: createPorts({
      menus: {
        ...createPorts().menus,
        async patchMeta(input) {
          patchCalls.push(input);
          return { downgradedFields: [] };
        },
      },
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

  const result = await workflow.execute(createExecuteInput());

  assert.equal(result.ok, true);
  assert.equal(result.notification.partial, true);
  assert.equal(result.queue.baselineAdvanced, false);
  assert.ok(result.userOutcome.warnings.some(message => message.includes('failed')));
  assert.deepEqual(patchCalls[0].patch, {
    last_updated_ts: 1000,
    draft_state: {},
    draft_saved_ts: null,
    draft_saved_by_user_id: null,
    draft_saved_by_name: '',
    draft_saved_source: '',
  });
});

test('workflow rejects unsupported intent before mutating state', async () => {
  const calls = [];
  const { createMenuPublishWorkflow } = await importWorkflow();
  const workflow = createMenuPublishWorkflow({
    ports: createPorts({
      menus: {
        ...createPorts().menus,
        async readContext() {
          calls.push('readContext');
          return createPorts().menus.readContext('menu-main');
        },
        async saveLiveMenu() {
          calls.push('saveLiveMenu');
        },
      },
    }),
  });

  await assert.rejects(
    workflow.execute(createWorkflowInput({ intent: 'archive' })),
    /unsupported command intent: archive/
  );
  assert.deepEqual(calls, []);
});

test('workflow send without selected sections does not claim it sent notifications', async () => {
  const { createMenuPublishWorkflow } = await importWorkflow();
  const workflow = createMenuPublishWorkflow({
    ports: createPorts({
      preview: {
        ...createPorts().preview,
        resolveSelection() {
          return {
            selectedChangeIds: [],
            selectedSections: [],
            clearedChangeIds: [],
            clearedSections: [],
          };
        },
      },
    }),
  });

  const result = await workflow.execute(createExecuteInput({ intent: 'send' }));

  assert.equal(result.ok, true);
  assert.equal(result.notification.attempted, false);
  assert.equal(result.userOutcome.successMessage, '✅ Main Menu send skipped.');
});

test('workflow logs clear-without-send when unchecked queue lines are dropped', async () => {
  const auditCalls = [];
  const { createMenuPublishWorkflow } = await importWorkflow();
  const workflow = createMenuPublishWorkflow({
    ports: createPorts({
      preview: {
        ...createPorts().preview,
        resolveSelection() {
          return {
            selectedChangeIds: [],
            selectedSections: [],
            clearedChangeIds: ['beer::added::lager'],
            clearedSections: [DEFAULT_SELECTED_SECTION],
          };
        },
      },
      audit: {
        async append(input) {
          auditCalls.push(input);
          return { downgradedFields: [] };
        },
      },
    }),
  });

  const result = await workflow.execute(createExecuteInput({ intent: 'send' }));

  assert.equal(result.ok, true);
  assert.ok(auditCalls.some(call => call.eventType === 'clear_without_send'));
  assert.ok(result.audit.loggedEvents.includes('clear_without_send'));
});
