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

test('wave 4 publish command module exports canonical preview and selected-change publish contract', async () => {
  const publishModuleSource = read('server/_menu-publish.js');
  const publishModule = await importApiModule('server/_menu-publish.js');

  assert.equal(typeof publishModule.previewMenuUpdateForMenu, 'function');
  assert.equal(typeof publishModule.publishMenuUpdateForMenu, 'function');
  assert.match(publishModuleSource, /menu-publish-preview\.v2/);
  assert.match(publishModuleSource, /serverOwned: true/);
  assert.match(publishModuleSource, /Will Save Only/);
  assert.match(publishModuleSource, /operation_id/);
  assert.match(publishModuleSource, /eventType: 'send_failed'/);
  assert.match(publishModuleSource, /__featured__/);
  assert.match(publishModuleSource, /selected_change_ids/);
  assert.match(publishModuleSource, /legacy_selected_change_ids/);
  assert.match(publishModuleSource, /sections_by_outcome/);
  assert.doesNotMatch(publishModuleSource, /previewDiff/);
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
  assert.match(openPreviewSource, /requestPublishPreviewThroughApi/);
  assert.doesNotMatch(openPreviewSource, /ensureCurrentMenuSession\(\)\.preview\(\)/);
});
