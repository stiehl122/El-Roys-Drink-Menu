const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sliceFunction(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Missing signature: ${signature}`);
  const end = nextSignature ? source.indexOf(nextSignature, start) : -1;
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

test('wave 5 shared runtime keeps server-owned manager and admin mutations on API command paths', () => {
  const source = read('app.js');

  const patchDraftSource = sliceFunction(
    source,
    'async function patchMenuDraftState(',
    'async function sbPatchRestaurantDesign('
  );
  const persistSource = sliceFunction(
    source,
    'async function persistState(',
    'function finalizeLiveCommit('
  );
  const saveNotificationsSource = sliceFunction(
    source,
    'async function saveNotifications(',
    'function _populateNotifCredKeys('
  );
  const saveCredKeysSource = sliceFunction(
    source,
    'async function saveNotifCredKeys(',
    'async function saveMenuUrl('
  );
  const saveMenuUrlSource = sliceFunction(
    source,
    'async function saveMenuUrl(',
    '// ─── ADMIN SWITCHER'
  );
  const saveDesignSource = sliceFunction(
    source,
    'async function saveDesign(',
    '// ─── CATEGORY MANAGEMENT'
  );

  assert.match(patchDraftSource, /saveDraftThroughApi/);
  assert.doesNotMatch(patchDraftSource, /sbPatchMenuMeta/);
  assert.doesNotMatch(patchDraftSource, /rest\/v1\/menu_meta/);

  assert.match(persistSource, /saveLiveMenuThroughApi/);
  assert.doesNotMatch(persistSource, /persistStateDirect/);
  assert.doesNotMatch(persistSource, /sbPatchMenuMeta/);
  assert.doesNotMatch(persistSource, /sbPatchRestaurantDesign/);
  assert.doesNotMatch(persistSource, /rest\/v1\/categories/);
  assert.doesNotMatch(persistSource, /rest\/v1\/items/);

  assert.match(saveNotificationsSource, /saveAdminSettingsThroughApi\('save_notifications'/);
  assert.doesNotMatch(saveNotificationsSource, /sbPatchMenuMeta/);
  assert.doesNotMatch(saveNotificationsSource, /rest\/v1\/menu_meta/);

  assert.match(saveCredKeysSource, /saveAdminSettingsThroughApi\('save_notification_credential_keys'/);
  assert.doesNotMatch(saveCredKeysSource, /sbPatchRestaurant/);
  assert.doesNotMatch(saveCredKeysSource, /rest\/v1\/restaurants/);

  assert.match(saveMenuUrlSource, /saveAdminSettingsThroughApi\('save_menu_url'/);
  assert.doesNotMatch(saveMenuUrlSource, /sbPatchMenuMeta/);
  assert.doesNotMatch(saveMenuUrlSource, /rest\/v1\/menu_meta/);

  assert.match(saveDesignSource, /saveAdminSettingsThroughApi\('save_restaurant_design'/);
  assert.doesNotMatch(saveDesignSource, /sbPatchRestaurantDesign/);
  assert.doesNotMatch(saveDesignSource, /rest\/v1\/restaurants/);
});

test('wave 5 no longer calls the legacy live-save fallback from the authoritative runtime save path', () => {
  const source = read('app.js');
  const matches = source.match(/persistStateDirect\(/g) || [];

  assert.equal(matches.length, 1);
  assert.match(source, /async function persistStateDirect\(/);
});

test('wave 5 publish session boundary prefers the server-owned publish command before local side effects', () => {
  const source = read('core/session/publish-service.js');
  const guardIndex = source.indexOf("if (typeof sessionPorts.publishMenuUpdate === 'function')");
  const fallbackPublishIndex = source.indexOf('return fallbackService.publishUpdate(options);');

  assert.notEqual(guardIndex, -1);
  assert.notEqual(fallbackPublishIndex, -1);
  assert.match(source, /return sessionPorts\.publishMenuUpdate\(options\);/);
  assert.ok(guardIndex < fallbackPublishIndex);
  assert.doesNotMatch(source, /persistState\(/);
  assert.doesNotMatch(source, /dispatchNotification\(/);
  assert.doesNotMatch(source, /patchMenuMeta/);
});
