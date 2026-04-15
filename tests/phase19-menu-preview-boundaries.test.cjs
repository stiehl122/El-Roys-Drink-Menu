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
  assert.match(publishRoute, /parsePublishBody/);
  assert.match(publishRoute, /selected_change_ids/);
});

test('wave 4 publish command module exports canonical preview and selected-change publish contract', async () => {
  const publishModuleSource = read('server/_menu-publish.js');
  const publishModule = await importApiModule('server/_menu-publish.js');

  assert.equal(typeof publishModule.previewMenuUpdateForMenu, 'function');
  assert.equal(typeof publishModule.publishMenuUpdateForMenu, 'function');
  assert.match(publishModuleSource, /menu-publish-preview\.v1/);
  assert.match(publishModuleSource, /serverOwned: true/);
  assert.match(publishModuleSource, /selected_change_ids/);
  assert.doesNotMatch(publishModuleSource, /previewDiff/);
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
  assert.doesNotMatch(publishApiSource, /preview_diff/);
  assert.doesNotMatch(publishApiSource, /selected_sections/);
  assert.doesNotMatch(publishApiSource, /patch_message/);
  assert.match(openPreviewSource, /requestPublishPreviewThroughApi/);
  assert.doesNotMatch(openPreviewSource, /ensureCurrentMenuSession\(\)\.preview\(\)/);
});
