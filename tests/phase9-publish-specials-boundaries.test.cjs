const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function importApiModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(ROOT, relativePath)).href;
  return import(`${fileUrl}?wave3=${Date.now()}-${Math.random()}`);
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test('manager route delegates publish auth and command execution through shared server modules', () => {
  const publishRoute = read('api/manager.js');

  assert.match(publishRoute, /from '\.\.\/server\/_menu-write\.js'/);
  assert.match(publishRoute, /readAuthorizedMenuActor/);
  assert.match(publishRoute, /from '\.\.\/server\/_menu-publish\.js'/);
  assert.match(publishRoute, /previewMenuUpdateForMenu/);
  assert.match(publishRoute, /publishMenuUpdateForMenu/);
  assert.match(publishRoute, /parsePublishBody/);
  assert.match(publishRoute, /legacySelectedSections/);
});

test('wave 3 publish command module owns notification delivery and persistence composition', async () => {
  const publishModuleSource = read('server/_menu-publish.js');
  const publishModule = await importApiModule('server/_menu-publish.js');

  assert.equal(typeof publishModule.previewMenuUpdateForMenu, 'function');
  assert.equal(typeof publishModule.publishMenuUpdateForMenu, 'function');
  assert.match(publishModuleSource, /from '\.\/_notification-gateway\.js'/);
  assert.match(publishModuleSource, /truncateNotificationText/);
  assert.match(publishModuleSource, /from '\.\/_notification-delivery\.js'/);
  assert.match(publishModuleSource, /deliverMenuNotification/);
  assert.match(publishModuleSource, /from '\.\/_menu-write\.js'/);
  assert.match(publishModuleSource, /saveLiveMenuForMenu/);
  assert.match(publishModuleSource, /patchMenuMetaForMenu/);
  assert.match(publishModuleSource, /insertUpdateLog/);
  assert.match(publishModuleSource, /menu-publish-preview\.v2/);
  assert.match(publishModuleSource, /buildCanonicalPreviewForMenu/);
  assert.match(publishModuleSource, /resolveSelection/);
  assert.match(publishModuleSource, /legacySelectedSections/);
});

test('server publish selection treats explicit empty legacy sections as clear-all', async () => {
  const originalFactory = globalThis.createMenuPublishWorkflow;
  let capturedSelection = null;

  globalThis.createMenuPublishWorkflow = ({ ports }) => ({
    async execute(command) {
      const preview = {
        changeGroups: [{
          id: 'beer::added::lager-group',
          selectable: true,
          lines: [{
            id: 'beer::added::lager',
            kind: 'added',
            name: 'Lager',
          }],
        }],
        notificationChanges: [{
          id: 'beer::added::lager',
          sectionId: 'beer',
          kind: 'added',
          name: 'Lager',
        }],
      };

      capturedSelection = ports.preview.resolveSelection({
        preview,
        selectedChangeIds: command.request?.selectedChangeIds ?? null,
        legacySelectedSections: command.request?.legacySelectedSections ?? null,
      });

      return {
        ok: true,
        ts: 1000,
        preview,
        revisions: {},
        notification: { delivered: false, partial: false, retryable: false, summary: null },
        queue: {
          selectedChangeIds: capturedSelection.selectedChangeIds,
          clearedChangeIds: capturedSelection.clearedChangeIds,
        },
        compatibility: { downgradedFields: [] },
        operationId: 'op-test',
        userOutcome: { warnings: [], successMessage: 'ok' },
        reconnect: null,
      };
    },
  });

  try {
    const publishModule = await importApiModule('server/_menu-publish.js');
    await publishModule.publishMenuUpdateForMenu({
      actor: { id: 'user-1', role: 'manager' },
      menuId: 'elroys-cantina-drinks',
      mode: 'send',
      source: 'web_manager',
      snapshot: {},
      selectedChangeIds: null,
      legacySelectedSections: [],
    });
  } finally {
    globalThis.createMenuPublishWorkflow = originalFactory;
  }

  assert.deepEqual(capturedSelection?.selectedChangeIds, []);
  assert.equal(capturedSelection?.selectedSections?.length, 0);
  assert.equal(capturedSelection?.clearedChangeIds?.length, 1);
});

test('server publish selection defaults omitted legacy sections to select-all', async () => {
  const originalFactory = globalThis.createMenuPublishWorkflow;
  let capturedSelection = null;

  globalThis.createMenuPublishWorkflow = ({ ports }) => ({
    async execute(command) {
      const preview = {
        changeGroups: [{
          id: 'beer::added::lager-group',
          selectable: true,
          lines: [{
            id: 'beer::added::lager',
            kind: 'added',
            name: 'Lager',
          }],
        }],
        notificationChanges: [{
          id: 'beer::added::lager',
          sectionId: 'beer',
          kind: 'added',
          name: 'Lager',
        }],
      };

      capturedSelection = ports.preview.resolveSelection({
        preview,
        selectedChangeIds: command.request?.selectedChangeIds ?? null,
        legacySelectedSections: command.request?.legacySelectedSections ?? null,
      });

      return {
        ok: true,
        ts: 1000,
        preview,
        revisions: {},
        notification: { delivered: false, partial: false, retryable: false, summary: null },
        queue: {
          selectedChangeIds: capturedSelection.selectedChangeIds,
          clearedChangeIds: capturedSelection.clearedChangeIds,
        },
        compatibility: { downgradedFields: [] },
        operationId: 'op-test',
        userOutcome: { warnings: [], successMessage: 'ok' },
        reconnect: null,
      };
    },
  });

  try {
    const publishModule = await importApiModule('server/_menu-publish.js');
    await publishModule.publishMenuUpdateForMenu({
      actor: { id: 'user-1', role: 'manager' },
      menuId: 'elroys-cantina-drinks',
      mode: 'send',
      source: 'web_manager',
      snapshot: {},
      selectedChangeIds: null,
    });
  } finally {
    globalThis.createMenuPublishWorkflow = originalFactory;
  }

  assert.equal(capturedSelection?.selectedChangeIds?.length, 1);
  assert.equal(capturedSelection?.clearedChangeIds?.length, 0);
});

test('server publish selection maps legacy __featured__ sections onto featured_specials', async () => {
  const originalFactory = globalThis.createMenuPublishWorkflow;
  let capturedSelection = null;

  globalThis.createMenuPublishWorkflow = ({ ports }) => ({
    async execute(command) {
      const preview = {
        changeGroups: [{
          id: 'featured_specials::added::happy-hour-marg-group',
          selectable: true,
          lines: [{
            id: 'featured_specials::added::happy-hour-marg',
            kind: 'added',
            name: 'Happy Hour Marg',
          }],
        }],
        notificationChanges: [{
          id: 'featured_specials::added::happy-hour-marg',
          sectionId: 'featured_specials',
          kind: 'added',
          name: 'Happy Hour Marg',
        }],
      };

      capturedSelection = ports.preview.resolveSelection({
        preview,
        selectedChangeIds: command.request?.selectedChangeIds ?? null,
        legacySelectedSections: command.request?.legacySelectedSections ?? null,
      });

      return {
        ok: true,
        ts: 1000,
        preview,
        revisions: {},
        notification: { delivered: false, partial: false, retryable: false, summary: null },
        queue: {
          selectedChangeIds: capturedSelection.selectedChangeIds,
          clearedChangeIds: capturedSelection.clearedChangeIds,
        },
        compatibility: { downgradedFields: [] },
        operationId: 'op-test',
        userOutcome: { warnings: [], successMessage: 'ok' },
        reconnect: null,
      };
    },
  });

  try {
    const publishModule = await importApiModule('server/_menu-publish.js');
    await publishModule.publishMenuUpdateForMenu({
      actor: { id: 'user-1', role: 'manager' },
      menuId: 'elroys-cantina-drinks',
      mode: 'send',
      source: 'web_manager',
      snapshot: {},
      selectedChangeIds: null,
      legacySelectedSections: [{
        id: '__featured__',
        added: ['Happy Hour Marg'],
        removed: [],
        eightySixed: [],
        restored: [],
      }],
    });
  } finally {
    globalThis.createMenuPublishWorkflow = originalFactory;
  }

  assert.equal(capturedSelection?.selectedChangeIds?.length, 1);
  assert.equal(capturedSelection?.clearedChangeIds?.length, 0);
});

test('manager publish handler preserves legacy selected_sections semantics across HTTP payloads', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const originalFetch = global.fetch;
  const originalFactory = globalThis.createMenuPublishWorkflow;
  const capturedRequests = [];
  const legacySelectedSection = {
    id: '__featured__',
    added: ['Happy Hour Marg'],
    removed: [],
    eightySixed: [],
    restored: [],
  };

  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/auth/v1/user')) {
      return {
        ok: true,
        async json() {
          return { id: 'user-1' };
        },
      };
    }
    if (href.includes('/rest/v1/profiles?')) {
      return {
        ok: true,
        async json() {
          return [{ role: 'manager', name: 'Alex' }];
        },
      };
    }
    if (href.includes('/rest/v1/menu_access?')) {
      return {
        ok: true,
        async json() {
          return [{ menu_id: '00000000-0000-0000-0000-000000000020' }];
        },
      };
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  globalThis.createMenuPublishWorkflow = () => ({
    async execute(command) {
      capturedRequests.push(command.request);
      return {
        ok: true,
        ts: 1000,
        preview: {},
        revisions: {},
        notification: { delivered: false, partial: false, retryable: false, summary: null },
        queue: {
          selectedChangeIds: [],
          clearedChangeIds: [],
        },
        compatibility: { downgradedFields: [] },
        operationId: 'op-test',
        userOutcome: { warnings: [], warningMessage: '', successMessage: 'ok' },
        reconnect: null,
      };
    },
  });

  try {
    const managerRoute = await importApiModule('api/manager.js');
    const baseRequest = {
      method: 'POST',
      url: '/api/manager',
      headers: {
        host: 'localhost',
        authorization: 'Bearer test-token',
      },
    };

    await managerRoute.default({
      ...baseRequest,
      body: {
        action: 'publish',
        menu_id: '00000000-0000-0000-0000-000000000020',
        mode: 'send',
        snapshot: {},
      },
    }, createMockResponse());

    await managerRoute.default({
      ...baseRequest,
      body: {
        action: 'publish',
        menu_id: '00000000-0000-0000-0000-000000000020',
        mode: 'send',
        snapshot: {},
        selected_sections: [],
      },
    }, createMockResponse());

    await managerRoute.default({
      ...baseRequest,
      body: {
        action: 'publish',
        menu_id: '00000000-0000-0000-0000-000000000020',
        mode: 'send',
        snapshot: {},
        selected_sections: [legacySelectedSection],
      },
    }, createMockResponse());
  } finally {
    global.fetch = originalFetch;
    globalThis.createMenuPublishWorkflow = originalFactory;
  }

  assert.equal(Object.prototype.hasOwnProperty.call(capturedRequests[0], 'legacySelectedSections'), false);
  assert.deepEqual(capturedRequests[1].legacySelectedSections, []);
  assert.deepEqual(capturedRequests[2].legacySelectedSections, [legacySelectedSection]);
});

test('app runtime prefers consolidated publish server boundaries', () => {
  const source = read('app.js');

  assert.match(source, /async function publishMenuThroughApi/);
  assert.match(source, /async function requestPublishPreviewThroughApi/);
  assert.match(source, /\/api\/manager/);
  assert.match(source, /action: 'preview_publish'/);
  assert.match(source, /selected_change_ids/);
  assert.match(source, /postApiJson\('\/api\/manager'/);
  assert.doesNotMatch(source, /action:\s*'specials'/);
  assert.doesNotMatch(source, /specials_action/);
});

test('manager route no longer exposes specials mutation transport', () => {
  const routeSource = read('api/manager.js');

  assert.doesNotMatch(routeSource, /executeRestaurantSpecialsCommand/);
  assert.doesNotMatch(routeSource, /parseSpecialsCommand/);
  assert.doesNotMatch(routeSource, /action === 'specials'/);
  assert.doesNotMatch(routeSource, /includeFlags\.includes\('restaurant-tools'\)/);
});
