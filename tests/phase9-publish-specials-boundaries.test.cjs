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

test('wave 3 publish route delegates auth and command execution through shared server modules', () => {
  const publishRoute = read('api/menu-publish.js');

  assert.match(publishRoute, /from '\.\.\/server\/_menu-write\.js'/);
  assert.match(publishRoute, /readAuthorizedMenuActor/);
  assert.match(publishRoute, /from '\.\.\/server\/_menu-publish\.js'/);
  assert.match(publishRoute, /previewMenuUpdateForMenu/);
  assert.match(publishRoute, /publishMenuUpdateForMenu/);
  assert.match(publishRoute, /body\?\.action/);
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
  assert.match(publishModuleSource, /menu-publish-preview\.v1/);
  assert.match(publishModuleSource, /buildCanonicalPreviewForMenu/);
  assert.match(publishModuleSource, /resolveSelectedChanges/);
});

test('wave 3 app runtime prefers publish and specials server boundaries', () => {
  const source = read('app.js');

  assert.match(source, /async function publishMenuThroughApi/);
  assert.match(source, /async function requestPublishPreviewThroughApi/);
  assert.match(source, /\/api\/menu-publish/);
  assert.match(source, /action: 'preview'/);
  assert.match(source, /selected_change_ids/);
  assert.match(source, /await ensureCurrentMenuSession\(\)\.publishUpdate/);
  assert.match(source, /await fetch\('\/api\/specials'/);
  assert.match(source, /async request\(action,\s*payload = \{\}\)/);
});

test('wave 3 specials route keeps restaurant-special mutations behind shared auth and server transport helpers', () => {
  const specialsRoute = read('api/specials.js');
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
