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

test('manager route delegates publish auth and command execution through shared server modules', () => {
  const publishRoute = read('api/manager.js');

  assert.match(publishRoute, /from '\.\.\/server\/_menu-write\.js'/);
  assert.match(publishRoute, /readAuthorizedMenuActor/);
  assert.match(publishRoute, /from '\.\.\/server\/_menu-publish\.js'/);
  assert.match(publishRoute, /previewMenuUpdateForMenu/);
  assert.match(publishRoute, /publishMenuUpdateForMenu/);
  assert.match(publishRoute, /parsePublishBody/);
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
});

test('app runtime prefers consolidated publish and specials server boundaries', () => {
  const source = read('app.js');

  assert.match(source, /async function publishMenuThroughApi/);
  assert.match(source, /async function requestPublishPreviewThroughApi/);
  assert.match(source, /\/api\/manager/);
  assert.match(source, /action: 'preview_publish'/);
  assert.match(source, /selected_change_ids/);
  assert.match(source, /await ensureCurrentMenuSession\(\)\.publishUpdate/);
  assert.match(source, /await fetch\('\/api\/manager'/);
  assert.match(source, /async request\(action,\s*payload = \{\}\)/);
});

test('manager route keeps restaurant-special mutations behind shared auth and server transport helpers', () => {
  const specialsRoute = read('api/manager.js');
  const specialsCommand = read('server/_specials-command.js');

  assert.match(specialsRoute, /from '\.\.\/server\/_auth\.js'/);
  assert.match(specialsRoute, /requireRole/);
  assert.match(specialsRoute, /from '\.\.\/server\/_supabase\.js'/);
  assert.match(specialsRoute, /getSupabaseServerConfig/);
  assert.match(specialsRoute, /from '\.\.\/server\/_specials-command\.js'/);
  assert.match(specialsRoute, /parseSpecialsCommand/);
  assert.match(specialsRoute, /executeRestaurantSpecialsCommand/);
  assert.match(specialsCommand, /requireRestaurantSpecialsAccess/);
  assert.match(specialsCommand, /serviceHeaders/);
  assert.match(specialsCommand, /export function createRestaurantSpecialsMutationService/);
  assert.doesNotMatch(specialsRoute, /queryAction/);
  assert.doesNotMatch(specialsRoute, /action\s*===\s*'migrate'/);
});
