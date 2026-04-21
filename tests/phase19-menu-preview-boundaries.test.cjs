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
  return import(`${fileUrl}?wave4=${Date.now()}-${Math.random()}`);
}

test('manager route supports server-owned preview and publish actions on one boundary', () => {
  const publishRoute = read('api/manager.js');

  assert.match(publishRoute, /previewMenuUpdateForMenu/);
  assert.match(publishRoute, /publishMenuUpdateForMenu/);
  assert.match(publishRoute, /save_quietly/);
  assert.match(publishRoute, /parsePublishBody/);
  assert.match(publishRoute, /selected_change_ids/);
  assert.match(publishRoute, /selected_group_ids/);
});

test('wave 4 publish command module exports workflow-backed preview and publish helpers', async () => {
  const publishModule = await importApiModule('server/_menu-publish.js');

  assert.equal(typeof publishModule.previewMenuUpdateForMenu, 'function');
  assert.equal(typeof publishModule.publishMenuUpdateForMenu, 'function');
});

test('wave 4 publish command module fails clearly when the ambient workflow factory is unavailable', async () => {
  const publishModule = await importApiModule('server/_menu-publish.js');
  const originalFactory = globalThis.createMenuPublishWorkflow;

  try {
    globalThis.createMenuPublishWorkflow = null;
    await assert.rejects(
      publishModule.previewMenuUpdateForMenu({
        actor: { id: 'tester' },
        menuId: 'leroys-drinks',
        source: 'test',
        snapshot: {},
      }),
      error => error instanceof Error
        && error.status === 500
        && error.message === 'createMenuPublishWorkflow is unavailable'
        && error.code === 'menu_publish_workflow_unavailable',
    );
  } finally {
    globalThis.createMenuPublishWorkflow = originalFactory;
  }
});

test('wave 4 publish command module rejects unsupported menus with an Error instance', async () => {
  const publishModule = await importApiModule('server/_menu-publish.js');

  await assert.rejects(
    publishModule.previewMenuUpdateForMenu({
      actor: { id: 'tester' },
      menuId: 'not-a-real-menu',
      source: 'test',
      snapshot: { cats: [] },
    }),
    error => error instanceof Error
      && error.status === 400
      && error.message === 'Unsupported menu_id'
      && error.menuId === 'not-a-real-menu',
  );
});

test('queue and publish preview boundaries preserve section display order metadata', async () => {
  const queueModule = await importApiModule('server/_menu-queue.js');
  const publishModuleSource = read('server/_menu-publish.js');

  const queueState = queueModule.buildCategoryQueueState({
    snapshot: {
      cats: [
        {
          key: 'wine',
          label: 'Wine',
          icon: '🍷',
          display_order: 2,
          items: [{ id: 'item-1', name: 'Rose', on_menu: true, visibility: 'public' }],
        },
        {
          key: 'beer',
          label: 'Beer',
          icon: '🍺',
          display_order: 0,
          items: [{ id: 'item-2', name: 'IPA', on_menu: true, visibility: 'public' }],
        },
      ],
    },
    lastSentState: {},
  });

  assert.equal(queueState.diff[0].id, 'beer');
  assert.equal(queueState.diff[0].displayOrder, 0);
  assert.equal(queueState.diff[1].id, 'wine');
  assert.equal(queueState.diff[1].displayOrder, 2);
  assert.match(publishModuleSource, /displayOrder:\s*Number\.isFinite\(Number\(section\.displayOrder\)\) \? Number\(section\.displayOrder\) : 0/);
});

test('app runtime requests canonical preview and no longer posts legacy preview payload fields', () => {
  const source = read('app.js');
  const publishApiStart = source.indexOf('async function requestPublishPreviewThroughApi()');
  const publishApiEnd = source.indexOf('async function saveAdminSettingsThroughApi', publishApiStart);
  const publishApiSource = source.slice(publishApiStart, publishApiEnd);
  const openPreviewStart = source.indexOf('async function openPreview()');
  const openPreviewEnd = source.indexOf('function closeModal()', openPreviewStart);
  const openPreviewSource = source.slice(openPreviewStart, openPreviewEnd);

  assert.match(publishApiSource, /action:\s*'preview_publish'/);
  assert.match(publishApiSource, /action:\s*'publish'/);
  assert.match(publishApiSource, /selected_change_ids/);
  assert.match(publishApiSource, /expected_notification_revision/);
  assert.doesNotMatch(publishApiSource, /expected_draft_revision:\s*draftEnvelope\?\.baseLastSentRevision/);
  assert.doesNotMatch(publishApiSource, /preview_diff/);
  assert.doesNotMatch(publishApiSource, /selected_sections/);
  assert.doesNotMatch(publishApiSource, /patch_message/);
  assert.match(openPreviewSource, /ensureCurrentMenuSession\(\)\.preparePublish\(/);
  assert.doesNotMatch(openPreviewSource, /requestPublishPreviewThroughApi/);
  assert.doesNotMatch(openPreviewSource, /ensureCurrentMenuSession\(\)\.preview\(\)/);
});
