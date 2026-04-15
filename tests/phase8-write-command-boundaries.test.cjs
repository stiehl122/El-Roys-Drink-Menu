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

test('consolidated manager and admin routes delegate through dedicated command modules', () => {
  const managerRoute = read('api/manager.js');
  const adminRoute = read('api/admin.js');

  assert.match(managerRoute, /from '\.\.\/server\/_menu-draft\.js'/);
  assert.match(managerRoute, /saveSharedDraftCommand/);
  assert.match(managerRoute, /from '\.\.\/server\/_menu-live\.js'/);
  assert.match(managerRoute, /saveLiveMenuCommand/);
  assert.match(adminRoute, /from '\.\.\/server\/_admin-settings\.js'/);
  assert.match(adminRoute, /executeAdminSettingsAction/);
});

test('wave 2 write helpers export stable command functions', async () => {
  const menuDraft = await importApiModule('server/_menu-draft.js');
  const menuLive = await importApiModule('server/_menu-live.js');
  const adminSettings = await importApiModule('server/_admin-settings.js');

  assert.equal(typeof menuDraft.parseDraftCommand, 'function');
  assert.equal(typeof menuDraft.saveSharedDraftCommand, 'function');
  assert.equal(typeof menuLive.saveLiveMenuCommand, 'function');
  assert.equal(typeof adminSettings.authorizeAdminSettingsRequest, 'function');
  assert.equal(typeof adminSettings.executeAdminSettingsAction, 'function');
});

test('app runtime prefers consolidated write command endpoints before direct table writes', () => {
  const source = read('app.js');

  assert.match(source, /async function saveDraftThroughApi/);
  assert.match(source, /\/api\/manager/);
  assert.match(source, /action: 'save_draft'/);
  assert.match(source, /async function saveLiveMenuThroughApi/);
  assert.match(source, /action: 'save_live'/);
  assert.match(source, /async function saveAdminSettingsThroughApi/);
  assert.match(source, /\/api\/admin/);
  assert.match(source, /const apiResult = await saveDraftThroughApi/);
  assert.match(source, /const apiResult = await saveLiveMenuThroughApi/);
  assert.match(source, /const apiResult = await saveAdminSettingsThroughApi\('save_notifications'/);
  assert.match(source, /const apiResult = await saveAdminSettingsThroughApi\('save_notification_credential_keys'/);
  assert.match(source, /const apiResult = await saveAdminSettingsThroughApi\('save_menu_url'/);
});
