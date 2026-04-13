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
  return import(`${fileUrl}?wave2=${Date.now()}-${Math.random()}`);
}

test('wave 2 write routes delegate through dedicated command modules', () => {
  const draftRoute = read('api/menu-draft.js');
  const liveRoute = read('api/menu-live.js');
  const adminRoute = read('api/admin-settings.js');

  assert.match(draftRoute, /from '\.\/_menu-draft\.js'/);
  assert.match(draftRoute, /saveSharedDraftCommand/);
  assert.match(liveRoute, /from '\.\/_menu-live\.js'/);
  assert.match(liveRoute, /saveLiveMenuCommand/);
  assert.match(adminRoute, /from '\.\/_admin-settings\.js'/);
  assert.match(adminRoute, /executeAdminSettingsAction/);
});

test('wave 2 write helpers export stable command functions', async () => {
  const menuDraft = await importApiModule('api/_menu-draft.js');
  const menuLive = await importApiModule('api/_menu-live.js');
  const adminSettings = await importApiModule('api/_admin-settings.js');

  assert.equal(typeof menuDraft.parseDraftCommand, 'function');
  assert.equal(typeof menuDraft.saveSharedDraftCommand, 'function');
  assert.equal(typeof menuLive.saveLiveMenuCommand, 'function');
  assert.equal(typeof adminSettings.authorizeAdminSettingsRequest, 'function');
  assert.equal(typeof adminSettings.executeAdminSettingsAction, 'function');
});

test('wave 2 app runtime prefers write command endpoints before direct table writes', () => {
  const source = read('app.js');

  assert.match(source, /async function saveDraftThroughApi/);
  assert.match(source, /\/api\/menu-draft/);
  assert.match(source, /async function saveLiveMenuThroughApi/);
  assert.match(source, /\/api\/menu-live/);
  assert.match(source, /async function saveAdminSettingsThroughApi/);
  assert.match(source, /\/api\/admin-settings/);
  assert.match(source, /const apiResult = await saveDraftThroughApi/);
  assert.match(source, /const apiResult = await saveLiveMenuThroughApi/);
  assert.match(source, /const apiResult = await saveAdminSettingsThroughApi\('save_notifications'/);
  assert.match(source, /const apiResult = await saveAdminSettingsThroughApi\('save_notification_credential_keys'/);
  assert.match(source, /const apiResult = await saveAdminSettingsThroughApi\('save_menu_url'/);
});
